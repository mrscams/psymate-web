import { APIRequestContext, APIResponse, expect, Locator, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { createAccount, signIn } from '../preferences/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { tabTo } from '../support/clavier';
import { expectTheme, settled, Theme, THEMES } from './a11y-support';

// Anneau de focus des contrôles natifs et de la barre d'administration (UX-A2, WCAG 1.4.11 : 3:1
// contre les couleurs adjacentes). Le focus est atteint par de vrais appuis sur Tab (:focus-visible),
// puis l'anneau est mesuré tel que rendu : couleur de l'outline contre le fond sur lequel il se pose
// et contre le halo qu'il borde. Mesures de départ (audit UX du 9 nov. 2026) : select « Tous les
// types » de l'éditeur de lien 1,21:1 (outline primary-tint seul), onglet « Praticiens » 2,71:1
// (cobalt sur la barre sombre). Contre l'API locale, jamais de mock du backend.

const API = 'http://localhost:8080';

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** Dossier d'un ressenti, ouvert ensuite dans l'éditeur de lien. */
async function createFolder(api: APIRequestContext): Promise<{ patientId: string; id: string }> {
  const patient = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName: 'Lou F.' } }),
  );
  // Toute entrée appartient à une séance (SESSION_REQUIRED) : la séance d'abord.
  await ok(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: { type: 'session', session: { modality: 'in_person' } },
    }),
  );
  const entry = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: {
        type: 'feeling',
        title: 'Tension 6/10',
        feeling: { emotionCode: 'anxiety', intensity: 6 },
      },
    }),
  );
  return { patientId: patient.id, id: entry.id };
}

interface Ring {
  style: string;
  width: number;
  offset: number;
  /** Couleur de l'outline, rgb(). */
  outline: string;
  /** Fond effectif sous l'élément (premier ancêtre au fond opaque), rgb(). */
  ground: string;
  /** Couleur du halo (box-shadow), ou null sans halo. */
  halo: string | null;
}

async function ring(target: Locator): Promise<Ring> {
  return target.evaluate((el) => {
    const css = getComputedStyle(el);
    let ground = 'rgb(255, 255, 255)';
    for (let node: Element | null = el.parentElement; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') {
        ground = bg;
        break;
      }
    }
    const shadow = css.boxShadow;
    return {
      style: css.outlineStyle,
      width: parseFloat(css.outlineWidth),
      offset: parseFloat(css.outlineOffset),
      outline: css.outlineColor,
      ground,
      halo: shadow === 'none' ? null : (/rgba?\([^)]*\)/.exec(shadow)?.[0] ?? null),
    };
  });
}

function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Anneau plein de 2 px au moins, à 3:1 au moins contre le fond et contre son halo éventuel. */
function expectVisibleRing(measured: Ring, what: string): void {
  expect(measured.style, `${what} : outline`).toBe('solid');
  expect(measured.width, `${what} : épaisseur`).toBeGreaterThanOrEqual(2);
  expect(
    contrast(measured.outline, measured.ground),
    `${what} : ${measured.outline} sur le fond ${measured.ground}`,
  ).toBeGreaterThanOrEqual(3);
  if (measured.halo) {
    expect(
      contrast(measured.outline, measured.halo),
      `${what} : ${measured.outline} contre le halo ${measured.halo}`,
    ).toBeGreaterThanOrEqual(3);
  }
}

for (const theme of THEMES) {
  test(`anneau de focus du select de l'éditeur de lien, au Tab (${theme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const account = await createAccount(request, `ux-a2.${theme}`, 'psychologist');
    await setPreferences(request, { theme });
    const folder = await createFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/timeline`);
    await expectTheme(page, theme);
    const card = page.locator(`pm-timeline-card article[data-entry-id="${folder.id}"]`);
    await card.click();
    const entryEditor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
    await expect(entryEditor).toBeVisible();
    await settled(page);
    await entryEditor
      .getByRole('button', { name: /Fermer/ })
      .first()
      .focus();
    await page.keyboard.press('l');
    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await settled(page);

    // Depuis la recherche (focalisée à l'ouverture), Tab jusqu'au select « Tous les types ».
    const select = dialog.getByLabel("Type d'entrée cherché");
    await expect(select.locator('option:checked')).toHaveText('Tous les types');
    await tabTo(page, select, { max: 5 });
    await expect(select).toBeFocused();
    expect(await select.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    const measured = await ring(select);
    expectVisibleRing(measured, `select (${theme})`);
    expect(measured.offset, 'anneau décalé de 2 px (étude §7)').toBe(2);
    expect(measured.halo, 'halo primary-tint (étude §7)').not.toBeNull();

    // Même anneau sur le champ de recherche (Maj+Tab) ; la page reste sans violation axe.
    const search = dialog.getByRole('searchbox', { name: 'Rechercher une entrée du dossier' });
    await tabTo(page, search, { backwards: true, max: 5 });
    expectVisibleRing(await ring(search), `recherche (${theme})`);
    await expectNoAxeViolations(page);
  });
}

test.describe("anneau de focus de la barre d'administration", () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  for (const theme of THEMES) {
    test(`onglet Praticiens au Tab (${theme})`, async ({ page, context }) => {
      test.setTimeout(90_000);
      const admin = await adminApi();
      try {
        await shareSession(admin, context);
        await page.emulateMedia({ colorScheme: theme as Theme });
        await page.goto('/fr/admin/validation');
        // La barre et la file rendues avant le premier Tab (sinon le focus repart du début).
        await expect(page.getByRole('heading', { level: 1, name: /^À vérifier/ })).toBeVisible();
        await settled(page);
        const tab = page
          .getByRole('navigation', { name: 'Administration' })
          .getByRole('link', { name: 'Praticiens' });
        await tabTo(page, tab, { max: 10 });
        const measured = await ring(tab);
        expectVisibleRing(measured, `onglet Praticiens (${theme})`);
        expect(measured.halo, 'pas de halo clair sur la barre sombre').toBeNull();
        await expectNoAxeViolations(page);
      } finally {
        await admin.dispose();
      }
    });
  }
});
