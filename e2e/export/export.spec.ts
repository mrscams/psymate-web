import { readFile } from 'node:fs/promises';

import {
  APIRequestContext,
  Download,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { SEED, TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// M6-06, fiche 19 « Données et export » et fiche 16 (menu « Exporter ce dossier ») : contre l'API
// locale (seed small, Mailpit), jamais de mock du backend. Le PDF vient d'un patient du seed
// (claire) ; l'export Markdown et l'export du compte utilisent un compte jetable, pour que le job
// d'export (un seul par compte) ne gêne aucun autre test.

const API = 'http://localhost:8080';
const DATA_PAGE = '/fr/mon-compte/donnees';

async function post<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await api.post(`${API}${path}`, { data });
  expect(response.status(), `${path} : ${await response.text()}`).toBe(201);
  return (await response.json()) as T;
}

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend. */
async function waitIntake(api: APIRequestContext, patientId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`pas de séance d'accueil pour ${patientId}`);
}

/** Patient créé par l'API (session du compte jetable portée par `api`), avec sa séance d'accueil. */
async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const { id } = await post<{ id: string }>(api, '/api/patients', { displayName });
  await waitIntake(api, id);
  return id;
}

/** `Tab` jusqu'à l'élément, sans souris : échoue s'il n'est pas atteignable. */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('élément jamais atteint au clavier');
}

/** Noms des fichiers d'un zip, lus dans son répertoire central (sans dépendance). */
function zipEntries(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, 'fin de répertoire central du zip').toBeGreaterThan(-1);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

async function content(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

const prepareButton = (page: Page) => page.getByRole('button', { name: "Préparer l'export" });
const lastExport = (page: Page) =>
  page.getByRole('region', { name: 'Dernier export' }).locator('[aria-live="polite"]');

test.describe('Données et export (fiche 19)', () => {
  // L'API prépare les exports de compte un par un (un seul fil, tous comptes) : en série, un job
  // n'attend jamais derrière celui d'un autre test de ce fichier.
  test.describe.configure({ mode: 'serial' });

  test('PDF d’un patient du seed au clavier : Tab → combobox → ↓ → Entrée → format → Exporter', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, SEED.claire);
    await page.goto(DATA_PAGE);
    await expect(page.getByRole('heading', { level: 1, name: 'Données et export' })).toBeVisible();
    await expect(page.getByText('Les entrées privées ne sont jamais exportées')).toBeVisible();
    const combobox = page.getByRole('combobox', { name: 'Patient' });
    await expect(combobox).toBeVisible();
    const exporter = page.getByRole('button', { name: 'Exporter', exact: true });
    await expect(exporter).toBeDisabled();
    await expectNoAxeViolations(page);

    await tabTo(page, combobox);
    await page.keyboard.type('Quentin');
    const option = page.getByRole('option', { name: /SEED · Quentin S\./ });
    await expect(option).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Enter');
    await expect(combobox).toHaveValue('SEED · Quentin S.');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');

    // Format : PDF (déjà actif), puis Exporter.
    const pdf = page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'PDF' });
    await page.keyboard.press('Tab');
    await expect(pdf).toBeFocused();
    await page.keyboard.press('Space');
    await expect(pdf).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(exporter).toBeFocused();

    const response = page.waitForResponse(
      (r) => r.url().includes('/export?format=pdf') && r.request().method() === 'GET',
    );
    const downloading = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const [answer, download] = await Promise.all([response, downloading]);

    expect(answer.status()).toBe(200);
    expect(answer.headers()['content-type']).toContain('application/pdf');
    expect(download.suggestedFilename()).toMatch(/^export-.+-\d{8}\.pdf$/);
    const file = await content(download);
    expect(file.length).toBeGreaterThan(0);
    expect(file.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expectNoAxeViolations(page);
  });

  test('fiche patient « Exporter ce dossier ▾ » → Markdown : l’entrée privée créée n’y est pas', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const account = await createAccount(request, 'm6-06.md', 'psychologist');
    const patientId = await createPatient(request, 'Iris T.');
    const tag = `${Date.now()}`;
    const visible = `Note clinique exportable PERLE-${tag}`;
    const hidden = `Note privée jamais exportée OPALE-${tag}`;
    await post(request, `/api/patients/${patientId}/entries`, {
      type: 'note',
      visibility: 'clinical',
      status: 'final',
      body: visible,
    });
    await post(request, `/api/patients/${patientId}/entries`, {
      type: 'note',
      visibility: 'private',
      status: 'final',
      body: hidden,
    });
    await signIn(page, account);

    await page.goto(`/fr/patients/${patientId}/fiche`);
    const exportCard = page.getByRole('region', { name: 'Export du dossier' });
    await expect(exportCard.getByText('Entrées privées exclues')).toBeVisible();
    const trigger = exportCard.getByRole('button', { name: /Exporter ce dossier/ });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expectNoAxeViolations(page);

    // Au clavier : Entrée ouvre le menu sur PDF, ↓ va à Markdown, Entrée télécharge.
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: "Format d'export" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await expect(menu.getByRole('menuitem', { name: /PDF/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: /Markdown/ })).toBeFocused();
    await expectNoAxeViolations(page);

    const response = page.waitForResponse((r) => r.url().includes('/export?format=md'));
    const downloading = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const [answer, download] = await Promise.all([response, downloading]);

    expect(answer.status()).toBe(200);
    expect(answer.headers()['content-type']).toContain('text/markdown');
    expect(download.suggestedFilename()).toMatch(/^export-.+-\d{8}\.md$/);
    const markdown = (await content(download)).toString('utf8');
    expect(markdown).toContain(visible);
    expect(markdown).not.toContain(hidden);
    expect(markdown).not.toContain(`OPALE-${tag}`);
    await expect(menu).toBeHidden();
    await expectNoAxeViolations(page);
  });

  test('export du compte au clavier : Préparer → dialogue → Lancer → Prêt → Télécharger le zip', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const account = await createAccount(request, 'm6-06.zip', 'psychologist');
    await createPatient(request, 'Iris T.');
    await signIn(page, account);

    await page.goto(DATA_PAGE);
    await expect(lastExport(page).getByText('Aucun export de compte en cours')).toBeVisible();
    await expectNoAxeViolations(page);

    await tabTo(page, prepareButton(page));
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: "Préparer l'export du compte" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('valable 7 jours');
    await expectNoAxeViolations(page);
    const launch = dialog.getByRole('button', { name: "Lancer l'export" });
    await tabTo(page, launch, 5);
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();

    // Suivi toutes les 3 s jusqu'à done : « Prêt · lien valable jusqu'au … ».
    await expect(lastExport(page).getByText('Prêt', { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    await expect(lastExport(page)).toContainText('lien valable jusqu');
    await expect(prepareButton(page)).toBeEnabled();
    await expectNoAxeViolations(page);

    // Seul l'identifiant du job est conservé côté client.
    const stored = await page.evaluate(() => localStorage.getItem('psymate.account.export'));
    expect(Object.keys(JSON.parse(stored ?? '{}')).sort()).toEqual(['jobId', 'owner']);

    const download = lastExport(page).getByRole('button', { name: 'Télécharger' });
    await tabTo(page, download, 10);
    const downloading = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const zip = await downloading;
    expect(zip.suggestedFilename()).toMatch(/^export-psymate-\d{8}\.zip$/);
    const names = zipEntries(await content(zip));
    expect(names).toContain('patients.md');
    const perPatient = names.filter((name) => name !== 'patients.md');
    expect(perPatient.filter((name) => name.endsWith('.md'))).toHaveLength(1);
    expect(perPatient.filter((name) => name.endsWith('.pdf'))).toHaveLength(1);

    // Quitter la page n'annule rien : au retour, le dernier job est relu.
    await page.goto('/fr/patients');
    await page.goto(DATA_PAGE);
    await expect(lastExport(page).getByText('Prêt', { exact: true })).toBeVisible();
  });

  test('second export pendant un job en cours : 409 affiché, « Préparer l’export » désactivé', async ({
    page,
    request,
  }) => {
    test.setTimeout(420_000);
    const account: TestAccount = await createAccount(request, 'm6-06.409', 'psychologist');
    await createPatient(request, 'Iris T.');
    await signIn(page, account);
    await page.goto(DATA_PAGE);
    await expect(prepareButton(page)).toBeEnabled();

    // Les jobs d'export passent un par un côté API : un export du compte du seed (claire, le plus
    // fourni) occupe la file, puis un job de ce compte est lancé ailleurs (autre session) ; il
    // reste « en attente » le temps de cliquer « Lancer l'export » ici. Filet : si le job a déjà
    // fini (202 ici), on attend « Prêt » et on recommence.
    const seed = await playwrightRequest.newContext();
    const login = await seed.post(`${API}/api/auth/login`, { data: SEED.claire });
    expect(login.status(), await login.text()).toBe(200);
    let conflict = false;
    for (let attempt = 0; attempt < 3 && !conflict; attempt++) {
      await prepareButton(page).click();
      const dialog = page.getByRole('dialog', { name: "Préparer l'export du compte" });
      const launch = dialog.getByRole('button', { name: "Lancer l'export" });
      await expect(launch).toBeVisible();
      const blocker = await seed.post(`${API}/api/me/export`, { data: {} });
      expect([202, 409], await blocker.text()).toContain(blocker.status());
      const elsewhere = await request.post(`${API}/api/me/export`, { data: {} });
      expect(elsewhere.status(), await elsewhere.text()).toBe(202);
      const answer = page.waitForResponse(
        (r) => r.url().endsWith('/api/me/export') && r.request().method() === 'POST',
      );
      await launch.click();
      conflict = (await answer).status() === 409;
      if (!conflict) {
        await expect(lastExport(page).getByText('Prêt', { exact: true })).toBeVisible({
          timeout: 120_000,
        });
      }
    }
    await seed.dispose();
    expect(conflict, '409 EXPORT_IN_PROGRESS obtenu').toBe(true);

    await expect(page.getByRole('alert').filter({ hasText: 'déjà en préparation' })).toBeVisible();
    await expect(prepareButton(page)).toBeDisabled();
    await expect(prepareButton(page)).toHaveAttribute('aria-describedby', 'prepare-note');
    await expect(page.locator('#prepare-note')).toContainText('Un seul export à la fois');
    await expectNoAxeViolations(page);
  });
});
