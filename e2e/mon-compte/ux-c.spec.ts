import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// UX-C1 à UX-C6 (audit UX du 9 nov. 2026) : les six pages de Mon compte fidèles aux maquettes 10,
// 13, 14, 17, 18, 19. Mesures de l'audit (hauteur à 1 440 px, largeur à 375 px, axe en clair et en
// sombre) et comportements ajoutés, contre l'API locale (compte jetable, jamais de mock). Captures
// pleine page dans PSYMATE_E2E_CAPTURES (hors du dépôt) seulement si la variable est définie.

const API = 'http://localhost:8080';

const PAGES = [
  { name: '10-profil-public', url: '/fr/mon-compte/profil-public', h1: 'Profil public' },
  {
    name: '13-dossier-professionnel',
    url: '/fr/mon-compte/dossier-professionnel',
    h1: 'Dossier professionnel',
  },
  { name: '14-preferences', url: '/fr/mon-compte/preferences', h1: 'Préférences' },
  { name: '17-emotions', url: '/fr/mon-compte/emotions', h1: 'Émotions personnalisées' },
  { name: '18-securite', url: '/fr/mon-compte/securite', h1: 'Compte et sécurité' },
  { name: '19-donnees', url: '/fr/mon-compte/donnees', h1: 'Données et export' },
] as const;

/** Hauteur maximale à 1 440 px (critères UX-C1 et UX-C5). */
const MAX_HEIGHT: Partial<Record<(typeof PAGES)[number]['name'], number>> = {
  '10-profil-public': 1900,
  '18-securite': 1400,
};

async function open(page: Page, target: (typeof PAGES)[number]): Promise<void> {
  await page.goto(target.url);
  await expect(page.getByRole('heading', { level: 1, name: target.h1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

async function patient(api: APIRequestContext, displayName: string): Promise<void> {
  const created = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(created.status(), await created.text()).toBe(201);
}

test.describe('à 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('six pages : hauteur bornée, axe 0 en clair puis en sombre, captures', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const account = await createAccount(request, 'ux-c.pages', 'psychologist');
    await patient(request, 'Marie D.');
    await signIn(page, account);

    for (const theme of ['light', 'dark'] as const) {
      if (theme === 'dark') await setPreferences(request, { theme: 'dark' });
      for (const target of PAGES) {
        await open(page, target);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await shoot(page, `ux-c-1440-${target.name}-${theme}`);
        const max = MAX_HEIGHT[target.name];
        if (max) {
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          expect.soft(height, `hauteur de ${target.url}`).toBeLessThanOrEqual(max);
        }
        await expectNoAxeViolations(page);
      }
    }
  });

  test('profil public (UX-C1) : grilles 2 colonnes, adresse publique en mono, interrupteurs, date localisée, « Enregistré · il y a »', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-c1.profil', 'psychologist');
    await signIn(page, account);
    await open(page, PAGES[0]);

    // Nom affiché et profession côte à côte ; code postal et ville aussi.
    const form = page.locator('form.form');
    // Photo | nom affiché, puis profession | titre affiché.
    const photo = await form.getByRole('button', { name: 'Changer la photo' }).boundingBox();
    const name = await form.getByText('Nom affiché', { exact: true }).boundingBox();
    expect(name!.x).toBeGreaterThan(photo!.x + 150);
    expect(Math.abs(name!.y - photo!.y)).toBeLessThan(40);
    const profession = await form.getByText('Profession', { exact: true }).boundingBox();
    const title = await form.getByText('Titre affiché', { exact: true }).boundingBox();
    expect(Math.abs(title!.y - profession!.y)).toBeLessThan(2);
    expect(title!.x).toBeGreaterThan(profession!.x + 150);
    const postal = await page.getByLabel('Code postal').boundingBox();
    const city = await page.getByLabel('Ville').boundingBox();
    expect(Math.abs(postal!.y - city!.y)).toBeLessThan(2);

    // Adresse publique sur sa ligne, en mono, sans schéma.
    const url = page.locator('pm-publish-card .url');
    await expect(page.locator('pm-publish-card .url-line')).toContainText('Adresse publique :');
    await expect(url).toHaveCSS('display', 'block');
    expect(await url.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
    expect((await url.textContent())?.replace(/​/g, '')).toMatch(
      /^localhost:\d+\/fr\/praticiens\//,
    );

    // Interrupteurs Material ; « Publié » inactif (dossier non approuvé).
    await expect(page.getByRole('switch', { name: 'Publié' })).toBeDisabled();
    const showEmail = page.getByRole('switch', { name: "Afficher l'e-mail" });
    await expect(showEmail).toHaveAttribute('aria-checked', 'false');
    await expect(showEmail.locator('xpath=ancestor::mat-slide-toggle')).toHaveCount(1);

    // Prochain créneau : champ date localisé, saisi au clavier, enregistré en ISO.
    const slot = page.getByLabel('Prochain créneau (facultatif)');
    await expect(slot).toHaveAttribute('placeholder', 'jj/mm/aaaa');
    const saved = page.waitForResponse(
      (res) => res.url().endsWith('/api/me/profile') && res.request().method() === 'PUT',
    );
    await slot.fill('20/11/2026');
    const response = await saved;
    expect(response.request().postDataJSON().nextSlotAt).toBe('2026-11-20');
    await expect(page.getByTestId('save-status')).toContainText(
      /Enregistré · (à l'instant|il y a)/,
    );
    await expectNoAxeViolations(page);
  });

  test('dossier professionnel (UX-C2) : aucun texte anglais natif, « Choisir un fichier », nom en mono, pluriels', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-c2.dossier', 'psychologist');
    await signIn(page, account);
    await open(page, PAGES[1]);

    const input = page.locator('#field-document-file');
    await expect(input).toHaveClass(/sr-only/);
    await expect(page.locator('label[for="field-document-file"]')).toContainText(
      'Choisir un fichier',
    );
    await expect(page.getByText('Aucun fichier choisi.')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Choose File|No file chosen|Browse/);
    await expect(page.getByRole('list', { name: 'Progression du dossier' })).toContainText(
      'Aucun déposé · 2 manquants',
    );

    // Au clavier : le champ masqué reçoit le focus, l'anneau se voit sur son libellé.
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    const outline = await page
      .locator('label[for="field-document-file"] .choose')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');

    await input.setInputFiles({
      name: 'master-psycho-2014.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    });
    const chosen = page.locator('#field-document-file-name .mono');
    await expect(chosen).toHaveText('master-psycho-2014.pdf');
    await expectNoAxeViolations(page);
  });

  test('préférences (UX-C3) : « Enregistré · il y a », tuiles sessions et connexion précédente', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-c3.prefs', 'psychologist');
    // Une connexion antérieure à celle du navigateur : c'est elle que « Connexion précédente » lit.
    const earlier = await request.post(`${API}/api/auth/login`, {
      data: { email: account.email, password: account.password, rememberMe: false },
    });
    expect(earlier.status(), await earlier.text()).toBe(200);
    await signIn(page, account);
    await open(page, PAGES[2]);
    await expect(page.getByTestId('save-status')).toHaveText('Enregistré automatiquement');

    const tiles = page.locator('.summary .tile');
    await expect(tiles).toHaveCount(3);
    await expect(tiles.nth(2)).toContainText('Sessions actives');
    await expect(tiles.nth(2).locator('dd.value')).toHaveText(/\d+ appareils?/);
    await expect(page.locator('.last-login')).toContainText('Connexion précédente :');

    await page
      .getByRole('group', { name: "Fenêtre d'analyse" })
      .getByRole('button', {
        name: '1 an',
      })
      .click();
    await expect(page.getByTestId('save-status')).toContainText(
      /Enregistré · (à l'instant|il y a)/,
    );
    await expectNoAxeViolations(page);
  });

  test('émotions (UX-C4) : avertissement dès 3 lettres, cartes de famille cliquables, radio 18 px', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-c4.emotions', 'psychologist');
    await signIn(page, account);
    await open(page, PAGES[3]);

    const label = page.getByRole('textbox', { name: 'Libellé', exact: true });
    await label.fill('Anx');
    await expect(page.getByText('Proche de « Anxiété » (vocabulaire global)')).toBeVisible();

    const card = page.locator('label.family', { hasText: 'Peur' });
    const box = await card.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Clic au bord droit de la carte, loin du radio : la carte entière est la cible.
    await card.click({ position: { x: box!.width - 6, y: box!.height / 2 } });
    const radio = page.getByRole('radio', { name: 'Peur' });
    await expect(radio).toBeChecked();
    const size = await radio.boundingBox();
    expect(Math.round(size!.width)).toBe(18);
    await expectNoAxeViolations(page);
  });

  test('données et export (UX-C6) : aide du sélecteur, bouton inactif expliqué, fichier attendu en mono', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-c6.donnees', 'psychologist');
    await patient(request, 'Marie D.');
    await signIn(page, account);
    await open(page, PAGES[5]);

    const combobox = page.getByRole('combobox', { name: 'Patient' });
    await expect(combobox).toHaveAccessibleDescription(
      'Tapez un nom ; les dossiers archivés sont en gris.',
    );
    const exporter = page.getByRole('button', { name: 'Exporter', exact: true });
    await expect(exporter).toBeDisabled();
    await expect(exporter).toHaveAccessibleDescription('Choisissez un patient pour exporter.');

    await combobox.fill('Marie');
    await page.getByRole('option', { name: /Marie D\./ }).click();
    await expect(exporter).toBeEnabled();
    await expect(page.locator('#export-file .mono')).toHaveText(/^export-marie-d-\d{8}\.pdf$/);
    await page
      .getByRole('group', { name: 'Format' })
      .getByRole('button', { name: 'Markdown' })
      .click();
    await expect(page.locator('#export-file .mono')).toHaveText(/^export-marie-d-\d{8}\.md$/);
    await expectNoAxeViolations(page);
  });
});

test.describe('à 375 × 812', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('six pages sans défilement horizontal, axe 0', async ({ page, request }) => {
    test.setTimeout(120_000);
    const account = await createAccount(request, 'ux-c.mobile', 'psychologist');
    await patient(request, 'Marie D.');
    await signIn(page, account);
    for (const target of PAGES) {
      await open(page, target);
      await shoot(page, `ux-c-375-${target.name}`);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect.soft(width, `largeur de défilement de ${target.url}`).toBe(375);
      await expectNoAxeViolations(page);
    }
  });
});
