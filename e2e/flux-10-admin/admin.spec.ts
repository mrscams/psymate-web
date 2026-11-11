import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { SEED, TestAccount } from '../support/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import {
  API,
  adminApi,
  completeProfile,
  letters,
  publishedPractitioner,
  shareSession,
  submittedAccount,
} from './helpers';

// B3 flux 10 (M7-07, fiches 20, 21, 22, 28) : valider un praticien, gérer les comptes, lire le
// journal, administrer le vocabulaire de l'annuaire. Contre l'API locale (seed small) et Mailpit,
// jamais de mock. Les scénarios administrateur demandent l'administrateur e2e local
// (PSYMATE_E2E_ADMIN_*, voir e2e/support/admin.ts) ; sans lui, ils sont ignorés et le disent.

const BANNER_UNDER_REVIEW = 'Votre dossier professionnel est en cours de vérification';

/**
 * Visionneuse (UX-E1) : aperçu natif dans une iframe (URL blob) si le navigateur lit les PDF,
 * sinon « Ouvrir le document » (Chromium sans lecteur PDF, comme en e2e headless).
 */
async function expectViewerRendered(page: Page): Promise<void> {
  const viewer = page.locator('pm-document-viewer');
  await expect(
    viewer
      .locator('iframe[src^="blob:"]')
      .or(viewer.getByRole('link', { name: /Ouvrir le document/ })),
  ).toBeVisible();
}

/** Connexion d'un praticien par l'écran (fiche 11), puis attente de /patients. */
async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
}

test('un praticien qui tape /admin est redirigé vers /patients', async ({ page }) => {
  await signIn(page, SEED.claire);
  await page.goto('/fr/admin');
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await page.goto('/fr/admin/vocabulaire');
  await expect(page).toHaveURL(/\/fr\/patients$/);
  // L'API refuse aussi : 403 ADMIN_ROLE_REQUIRED.
  const direct = await page.request.get(`${API}/api/admin/verifications`);
  expect(direct.status()).toBe(403);
  expect(((await direct.json()) as { code: string }).code).toBe('ADMIN_ROLE_REQUIRED');
});

test.describe('administration', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  let admin: APIRequestContext;

  test.beforeAll(async () => {
    admin = await adminApi();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('flux 10 : décision sans message refusée, puis approbation → bandeau disparu, le praticien publie', async ({
    page,
    browser,
    context,
  }, testInfo) => {
    test.setTimeout(180_000);
    const practitioner = await submittedAccount('m7-07.flux10');
    const baseURL = testInfo.project.use.baseURL;

    // Avant la décision : le praticien voit le bandeau « en cours de vérification ».
    const before = await browser.newContext({ baseURL, locale: 'fr-FR' });
    const practitionerPage = await before.newPage();
    await signIn(practitionerPage, practitioner);
    await expect(practitionerPage.getByText(BANNER_UNDER_REVIEW)).toBeVisible();
    await before.close();

    await shareSession(admin, context);
    const fileServed = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/admin/verifications/${practitioner.id}/documents/`) &&
        res.url().includes('/file?'),
    );
    await page.goto(`/fr/admin/validation/${practitioner.id}`);
    await expect(page.getByRole('heading', { level: 1, name: /^À vérifier/ })).toBeVisible();
    await expect(page.locator('#dossier-title')).toHaveText('Alix Essai');
    const documents = page
      .getByRole('list', { name: 'Justificatifs du dossier' })
      .getByRole('listitem');
    await expect(documents).toHaveCount(2);
    // Visionneuse : URL signée, puis fichier lu (consigné par le serveur), rendu dans une iframe native.
    expect((await fileServed).status()).toBe(200);
    await expectViewerRendered(page);
    await expectNoAxeViolations(page);

    // Complément et refus actifs (UX-E1) : sans message, l'erreur s'affiche sous « Message au
    // praticien », qui prend le focus, et rien ne part au serveur.
    const decisionUrl = `/api/admin/verifications/${practitioner.id}/decision`;
    const posted: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith(decisionUrl)) posted.push(req.url());
    });
    await page.getByRole('button', { name: 'Demander un complément' }).click();
    const message = page.locator('#field-messageToPractitioner');
    await expect(page.locator('#field-messageToPractitioner-error')).toHaveText(
      'Ce champ est obligatoire.',
    );
    await expect(message).toHaveAttribute('aria-invalid', 'true');
    await expect(message).toBeFocused();
    await page.getByRole('button', { name: 'Refuser et suspendre' }).click();
    await expect(message).toBeFocused();
    expect(posted).toHaveLength(0);
    await expectNoAxeViolations(page);
    // Le serveur reste juge : la même décision forcée par l'API est refusée (422 MESSAGE_REQUIRED).
    const refused = await admin.post(`${API}${decisionUrl}`, {
      data: { kind: 'needs_more', messageToPractitioner: '', checklist: {} },
    });
    expect(refused.status()).toBe(422);
    expect(((await refused.json()) as { errors: { code: string }[] }).errors[0].code).toBe(
      'MESSAGE_REQUIRED',
    );

    // Justificatifs conformes (PATCH immédiat), liste de contrôle cochée, approbation.
    for (const name of [/Conforme\s*Master 2 Psychologie clinique/, /Conforme\s*Carte nationale/]) {
      const patched = page.waitForResponse(
        (res) => res.request().method() === 'PATCH' && res.url().includes('/documents/'),
      );
      await page.getByRole('checkbox', { name }).check();
      expect((await patched).status()).toBe(200);
    }
    for (const point of [
      'Le nom concorde sur toutes les pièces',
      'Le diplôme correspond à la profession déclarée',
      'Le numéro est retrouvé dans le registre public',
      'Les documents sont lisibles et non altérés',
    ]) {
      await page.getByRole('checkbox', { name: point }).check();
    }
    const decided = page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/admin/verifications/${practitioner.id}/decision`) &&
        res.status() !== 422,
    );
    await page.getByRole('button', { name: 'Approuver', exact: true }).click();
    expect((await decided).status()).toBe(201);
    await expect(page.getByText('Alix Essai approuvé·e · e-mail envoyé')).toBeVisible();
    // Le dossier sort de la file : la page passe au suivant (ou à la file vide).
    await expect(page).not.toHaveURL(new RegExp(practitioner.id));

    // Journal du praticien (UX-G2b) : la décision et sa ligne admin.decision sont nommées en
    // français ; ni « approved » ni « admin.decision » seuls dans la colonne Événement.
    await page.goto(`/fr/admin/journal?period=all&practitioner=${practitioner.id}`);
    const events = page.locator('tbody tr td:nth-child(3) .event > span:not(.times)');
    await expect(events.filter({ hasText: /^Dossier approuvé$/ })).toHaveCount(1);
    await expect(
      events.filter({ hasText: /^Décision enregistrée : Dossier approuvé$/ }),
    ).toHaveCount(1);
    for (const text of await events.allTextContents()) {
      expect(text.trim()).not.toMatch(/^[a-z0-9_.]+$/);
    }
    await expectNoAxeViolations(page);

    // Le praticien, reconnecté : plus de bandeau, et il peut publier sa fiche.
    const after = await browser.newContext({ baseURL, locale: 'fr-FR' });
    const approvedPage = await after.newPage();
    await signIn(approvedPage, practitioner);
    await expect(approvedPage.getByText('Votre dossier professionnel')).toHaveCount(0);
    const profile = await approvedPage.request.put(`${API}/api/me/profile`, {
      data: completeProfile(`Claire Valette ${letters()}`, practitioner.email, ['anxiety']),
    });
    expect(profile.status(), await profile.text()).toBe(200);
    await approvedPage.goto('/fr/mon-compte/profil-public');
    const published = approvedPage.getByRole('switch', { name: 'Publié' });
    await expect(published).toBeEnabled();
    const publish = approvedPage.waitForResponse((res) =>
      res.url().endsWith('/api/me/profile/publish'),
    );
    await published.click();
    expect((await publish).status()).toBe(204);
    await expect(published).toBeChecked();
    // Ménage : la fiche de test sort de l'annuaire.
    await approvedPage.request.post(`${API}/api/me/profile/unpublish`);
    await after.close();
    await practitioner.api.dispose();
  });

  test('praticiens : suspendre puis réactiver avec motif, filtres dans l’URL', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const practitioner = await submittedAccount('m7-07.suspendre');
    await shareSession(admin, context);
    await page.goto(`/fr/admin/praticiens?q=${encodeURIComponent(practitioner.email)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Praticiens' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: practitioner.email });
    await expect(row).toContainText('En vérification');
    await expectNoAxeViolations(page);

    await row.getByRole('button', { name: /Suspendre…/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Suspendre Alix Essai ?' })).toBeVisible();
    await expect(dialog.getByLabel('Motif de la suspension')).toBeFocused();
    await expect(dialog.getByRole('checkbox', { name: /Envoyer le motif/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /Envoyer le motif/ })).toBeDisabled();
    const confirm = dialog.getByRole('button', { name: 'Suspendre le compte' });
    await dialog.getByLabel('Motif de la suspension').fill('Trop court');
    await expect(confirm).toBeDisabled();
    await dialog
      .getByLabel('Motif de la suspension')
      .fill('Justificatifs incohérents avec le registre public, vérification en cours.');
    await expectNoAxeViolations(page);
    const suspended = page.waitForResponse((res) => res.url().endsWith('/suspend'));
    await confirm.click();
    expect((await suspended).status()).toBe(200);
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText('Suspendu');

    // Sessions révoquées par la suspension : l'ancienne session n'est plus reconnue, et une nouvelle
    // connexion est refusée avec ACCOUNT_SUSPENDED (le client affiche alors l'écran 27).
    const me = await practitioner.api.get(`${API}/api/auth/me`);
    expect(me.status()).toBe(401);
    expect(((await me.json()) as { code: string }).code).toBe('UNAUTHENTICATED');
    const login = await practitioner.api.post(`${API}/api/auth/login`, {
      data: { email: practitioner.email, password: practitioner.password },
    });
    expect(login.status()).toBe(403);
    expect(((await login.json()) as { code: string }).code).toBe('ACCOUNT_SUSPENDED');

    await row.getByRole('button', { name: /Réactiver…/ }).click();
    await dialog
      .getByLabel('Motif de la réactivation')
      .fill('Vérification faite auprès du registre, le dossier reprend son cours.');
    const reactivated = page.waitForResponse((res) => res.url().endsWith('/reactivate'));
    await dialog.getByRole('button', { name: 'Réactiver le compte' }).click();
    expect((await reactivated).status()).toBe(200);
    await expect(row).toContainText('En vérification');

    // Segment de statut dans l'URL.
    await page.getByRole('button', { name: /^Suspendu/ }).click();
    await expect(page).toHaveURL(/status=suspended/);
    await practitioner.api.dispose();
  });

  test('vocabulaire : désactiver une spécialité publiée → 409 avec le compteur, la ligne reste active', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const code = `e2e_m707_${letters(8)}`;
    const created = await admin.post(`${API}/api/admin/vocabulary/directory`, {
      data: { kind: 'specialty', code, labelFr: `Spécialité de test ${code}` },
    });
    expect(created.status(), await created.text()).toBe(201);
    const practitioner = await publishedPractitioner(admin, [code]);
    try {
      await shareSession(admin, context);
      await page.goto('/fr/admin/vocabulaire');
      await expect(
        page.getByRole('heading', { level: 1, name: "Vocabulaire de l'annuaire" }),
      ).toBeVisible();
      await expect(page.getByRole('tab', { name: /Spécialités/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const row = page.getByRole('row').filter({ hasText: code });
      await expect(row).toContainText('Utilisée par 1 profil publié');
      await expectNoAxeViolations(page);

      await row.getByRole('button', { name: /Désactiver…/ }).click();
      const dialog = page.getByRole('dialog');
      const refused = page.waitForResponse((res) => res.url().endsWith(`/specialty/${code}`));
      await dialog.getByRole('button', { name: 'Désactiver', exact: true }).click();
      expect((await refused).status()).toBe(409);
      await expect(dialog.getByRole('alert')).toContainText('Utilisée par 1 profil publié');
      await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused();
      await expectNoAxeViolations(page);
      await dialog.getByRole('button', { name: 'Fermer' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row).toContainText('Active');

      // Modalités et langues : lecture seule.
      await page.getByRole('tab', { name: /Langues/ }).click();
      await expect(page).toHaveURL(/kind=language/);
      await expect(page.getByRole('tabpanel').getByRole('row')).toHaveCount(16);
      await expect(page.getByRole('tabpanel').getByRole('button')).toHaveCount(0);
    } finally {
      // Ménage : fiche retirée, spécialité de test désactivée (jamais supprimée).
      await practitioner.api.post(`${API}/api/me/profile/unpublish`);
      await admin.patch(`${API}/api/admin/vocabulary/directory/specialty/${code}`, {
        data: { active: false },
      });
      await practitioner.api.dispose();
    }
  });

  test('clavier : file (↑ ↓ Entrée), sous-onglets (flèches), Renommer (Échap), dialogue (Échap)', async ({
    page,
    context,
  }) => {
    await shareSession(admin, context);
    await page.goto('/fr/admin/validation');
    const links = page
      .getByRole('list', { name: 'Dossiers en attente de vérification' })
      .getByRole('link');
    await expect(links.nth(1)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/validation\/[0-9a-f-]{36}$/);
    await links.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(links.nth(1)).toBeFocused();
    const second = await links.nth(1).getAttribute('href');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${second}$`));
    await page.keyboard.press('ArrowUp');
    await expect(links.first()).toBeFocused();

    await page.goto('/fr/admin/vocabulaire');
    const specialties = page.getByRole('tab', { name: /Spécialités/ });
    await specialties.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/kind=audience/);
    await expect(page.getByRole('tab', { name: /Publics/ })).toBeFocused();
    await expect(page.getByRole('tab', { name: /Publics/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(specialties).toBeFocused();

    // Renommer au clavier : panneau annoncé, Échap le ferme et rend le focus au bouton.
    const rename = page.getByRole('button', { name: /^Renommer/ }).first();
    await rename.focus();
    await page.keyboard.press('Enter');
    await expect(rename).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Libellé FR', { exact: true }).first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(rename).toHaveAttribute('aria-expanded', 'false');
    await expect(rename).toBeFocused();

    // « Désactiver… » au clavier : le dialogue s'ouvre sur « Annuler », Échap le ferme sans rien changer.
    const deactivate = page.getByRole('button', { name: /^Désactiver…/ }).first();
    await deactivate.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(deactivate).toBeFocused();
  });

  test('journal : lecture seule, paginé par curseur, focus sur la première nouvelle ligne', async ({
    page,
    context,
  }) => {
    await shareSession(admin, context);
    await page.goto('/fr/admin/journal?period=all');
    await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
    const rows = page.locator('tbody tr');
    // 50 événements par page ; les rafales identiques sont regroupées (UX-E3) : 50 lignes au plus.
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    expect(before).toBeLessThanOrEqual(50);
    // Horodatage Intl « 9 nov. 2026 · 11:14:46 » (UX-E3).
    await expect(rows.first().locator('td').first()).toHaveText(
      /^\d{1,2} [a-zéû]+\.? \d{4} · \d{2}:\d{2}:\d{2}$/,
    );
    await expectNoAxeViolations(page);
    // Focus sur la première nouvelle ligne (fiche 22) : celle du premier événement de la page 2,
    // ou la tête de son groupe s'il rejoint un groupe replié (JournalPage.more()).
    const nextPage = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === '/api/admin/journal' &&
        new URL(res.url()).searchParams.has('cursor'),
    );
    await page.getByRole('button', { name: 'Afficher plus' }).click();
    const firstNew = ((await (await nextPage).json()) as { items: { id: string }[] }).items[0].id;
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
    const focused = page.locator('tbody tr:focus');
    await expect(focused).toHaveCount(1);
    const focusedId = await focused.getAttribute('data-id');
    if (focusedId !== firstNew) {
      // Groupe replié : la ligne n'est pas rendue, la tête focalisée la contient une fois dépliée.
      await expect(page.locator(`tbody tr[data-id="${firstNew}"]`)).toHaveCount(0);
      const toggle = focused.locator('.group-toggle');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      const member = page.locator(`tbody tr[data-id="${firstNew}"]`);
      await expect(member).toHaveClass(/nested/);
      // Entre la tête et la ligne : seulement des lignes du même groupe (dépliées).
      expect(
        await member.evaluate((tr, leadId) => {
          let row = tr.previousElementSibling;
          while (row?.classList.contains('nested')) row = row.previousElementSibling;
          return row?.getAttribute('data-id') === leadId;
        }, focusedId),
      ).toBe(true);
      await toggle.click();
    }

    // Segment « Accès aux documents » : filtre dans l'URL, lignes de ce type seulement.
    await page.getByRole('button', { name: 'Accès aux documents' }).click();
    await expect(page).toHaveURL(/type=documents/);
    await expect(rows.first()).toContainText('admin.document_read');
    await expect(page.locator('table.refreshing')).toHaveCount(0);
    await expect(rows.filter({ hasNotText: 'admin.document_read' })).toHaveCount(0);
    // Groupe de lignes identiques : se déplie et se replie (aria-expanded).
    const toggle = page.locator('.group-toggle').first();
    if ((await toggle.count()) > 0) {
      const collapsed = await rows.count();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(() => rows.count()).toBeGreaterThan(collapsed);
      await expectNoAxeViolations(page);
      await toggle.click();
      await expect(rows).toHaveCount(collapsed);
    }
    // Aucune adresse IP complète dans la page.
    expect(await page.locator('main').innerText()).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});
