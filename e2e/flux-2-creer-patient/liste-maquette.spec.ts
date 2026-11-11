import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { keyboardOnly } from '../support/clavier';

// UX-B1 : liste des patients fidèle à la fiche 01 et à sa maquette (colonnes Patient · Dernière
// séance · Émotions dominantes 30 j · Situations actives · Flags, compteur, filtres rapides, menu des
// tags, pied, patient DEMO, ligne entièrement cliquable). Contre l'API locale, jamais de mock :
// chaque test crée son compte jetable et ses patients (le résumé de chaque ligne vient de
// GET /api/patients/{id}/overview).

const API = 'http://localhost:8080';

async function createPatient(
  api: APIRequestContext,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Liste lue et résumés arrivés (plus aucune barre d'attente). */
async function settled(page: Page): Promise<void> {
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('pm-patient-table .pending')).toHaveCount(0, { timeout: 15_000 });
}

test('maquette 01 : colonnes, compteur, filtres rapides, pied, DEMO ; axe clair et sombre ; 375 px', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'ux-b1.liste', 'psychologist');
  await createPatient(request, {
    displayName: 'Marie D.',
    birthDate: '1990-04-12',
    pronoun: 'elle',
    followUp: { since: '2025-03-01' },
    flags: [{ kind: 'watch', reason: 'Sommeil' }],
  });
  await createPatient(request, { displayName: 'Omar B.' });
  await createPatient(request, { displayName: `DEMO · Camille R.` });
  await signIn(page, account);
  await settled(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes patients');
  await expect(page.locator('.counter')).toHaveText(/^3 suivis actifs/);
  await expect(page.locator('pm-patient-table thead th')).toHaveText([
    'Patient',
    'Dernière séance',
    'Émotions dominantes · 30 j',
    'Situations actives',
    'Flags',
    'Actions',
  ]);
  const quick = page.getByRole('group', { name: 'Filtres rapides' });
  await expect(quick.getByRole('button', { name: 'Tous · 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(quick.getByRole('button', { name: 'Flags · 1' })).toBeVisible();
  await expect(page.locator('.table-footer .shown')).toHaveText(
    '3 patients affichés sur 3 · filtrés par « Tous »',
  );
  await expect(page.locator('.table-footer .keys')).toHaveText(
    '↑ ↓ choisir · Entrée ouvrir · N nouveau',
  );

  // Marie : âge et début du suivi, drapeau ambre, dernière séance (séance d'accueil de l'API).
  const marie = page.getByRole('row').filter({ hasText: 'Marie D.' });
  await expect(marie.locator('.detail')).toHaveText(/^\d+ ans · suivie depuis mars 2025$/);
  await expect(marie.locator('td.flags')).toContainText('À surveiller');
  await expect(marie.locator('.open')).toHaveText('Ouvrir →');

  // Patient de démonstration : badge DEMO, avatar pointillé, « Supprimer » à la place du menu.
  const demo = page.getByRole('row').filter({ hasText: 'Camille R.' });
  await expect(demo.locator('.demo-badge')).toHaveText('DEMO');
  await expect(demo.locator('.avatar.dashed')).toHaveText('CR');
  await expect(
    demo.getByRole('button', { name: 'Supprimer la démo : DEMO · Camille R.' }),
  ).toHaveText('Supprimer');
  await expect(demo.getByRole('button', { name: /Plus d'actions/ })).toHaveCount(0);

  await shoot(page, 'ux-b1-01-patients-1440', false);
  await expectNoAxeViolations(page);

  // Filtre rapide « Flags » : seule Marie, le pied le dit.
  await quick.getByRole('button', { name: 'Flags · 1' }).click();
  await expect(page.getByRole('table').getByRole('link')).toHaveText(['Marie D.']);
  await expect(page.locator('.table-footer .shown')).toHaveText(
    '1 patient affiché sur 3 · filtré par « Flags »',
  );
  await quick.getByRole('button', { name: 'Tous · 3' }).click();
  await expect(page.locator('pm-patient-table tbody tr')).toHaveCount(3);

  // Thème sombre : mêmes contrôles axe.
  await setPreferences(request, { theme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settled(page);
  await shoot(page, 'ux-b1-01-patients-1440-sombre', false);
  await expectNoAxeViolations(page);
  await setPreferences(request, { theme: 'light' });

  // 375 px : la page ne défile pas horizontalement (seul le tableau défile dans sa carte).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await settled(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expectNoAxeViolations(page);

  // Ligne entièrement cliquable : un clic hors du nom (colonne Situations) ouvre le dossier. Le
  // lien étendu recouvre la cellule : force, pour cliquer au point sans exiger la cellule au-dessus.
  await page.setViewportSize({ width: 1440, height: 900 });
  await marie.locator('td.situations').click({ force: true });
  await expect(page).toHaveURL(/\/fr\/patients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marie D.');
});

test('clavier : / puis ↓ choisit la première ligne, ↓ la suivante, Entrée ouvre la vue d’ensemble', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-b1.clavier', 'psychologist');
  await createPatient(request, { displayName: 'Léa M.' });
  await createPatient(request, { displayName: 'Paul R.' });
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.reload();
  await settled(page);

  const links = page.locator('pm-patient-table a.row-link');
  await expect(links).toHaveCount(2);
  const second = await links.nth(1).getAttribute('href');
  const secondName = (await links.nth(1).textContent())?.trim();

  await page.keyboard.press('/');
  await expect(page.locator('#patients-filter')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(links.first()).toBeFocused();
  await expect(page.locator('pm-patient-table tbody tr').first()).toHaveCSS('position', 'relative');
  await expectNoAxeViolations(page);
  await page.keyboard.press('ArrowDown');
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  // /patients/:id/overview mène à l'onglet 1 du dossier, /patients/:id (M1-07).
  await expect(page).toHaveURL(new RegExp(`${second!.replace(/\/overview$/, '')}(/overview)?$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(secondName!);
  keys.expectNoPointer();
});
