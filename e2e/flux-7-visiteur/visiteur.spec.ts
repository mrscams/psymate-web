import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { publishPsychologistInParis, PublishedPractitioner } from './published-practitioner';

// B3 flux 7 (M5-05, fiches 08, 09, 24) : un visiteur, sans compte ni connexion, trouve une
// psychologue à Paris, filtre par spécialité, ouvre sa fiche et lui écrit ; le message arrive dans
// Mailpit. Contre l'API réelle : le seed small n'a aucune fiche publiée, le premier test en publie
// une (administrateur e2e, voir e2e/support/admin.ts).
//
// Limite du contrat : 5 envois de formulaire par heure et par IP (G Q24). Ce fichier en fait deux
// par lancement ; au-delà de deux lancements dans l'heure, l'API répond 429 (attendu, pas un bug).

const MAILPIT = 'http://localhost:8025';
const EMERGENCY = /3114|\bSAMU\b|numéros? d.urgence/i;

/** Messages Mailpit qui contiennent ce texte (recherche plein texte). */
async function mailpitSearch(request: APIRequestContext, text: string): Promise<{ ID: string }[]> {
  const response = await request.get(`${MAILPIT}/api/v1/search`, {
    params: { query: `"${text}"` },
  });
  return ((await response.json()) as { messages?: { ID: string }[] }).messages ?? [];
}

/** Choisit une option d'un mat-select par son libellé. */
async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Aucune requête vers les routes patient depuis le layout public (fiche 09). */
function watchPatientCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/patients')) calls.push(request.url());
  });
  return calls;
}

test.describe.configure({ mode: 'serial' });

test.describe('flux 7 : un visiteur trouve et contacte un praticien', () => {
  let practitioner: PublishedPractitioner;

  test.beforeAll(async () => {
    test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
    test.setTimeout(60_000);
    practitioner = await publishPsychologistInParis();
  });

  test('trouver une psychologue à Paris, filtrer par spécialité, ouvrir sa fiche, lui écrire', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const patientCalls = watchPatientCalls(page);

    // Annuaire, sans session : note « seuls les praticiens vérifiés », aucun numéro d'urgence.
    await page.goto('/fr/annuaire');
    await expect(
      page.getByRole('heading', { level: 1, name: /Trouver un psychologue/ }),
    ).toBeVisible();
    await expect(
      page.getByText('Seuls les praticiens dont le dossier a été vérifié'),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(EMERGENCY);
    await expect(page.locator('pm-practitioner-card').first()).toBeVisible();
    await expectNoAxeViolations(page);

    // Ville + profession : l'URL porte la recherche, la liste suit sans rechargement.
    const search = page.getByRole('search', { name: 'Rechercher un praticien' });
    await search.getByLabel('Ville').fill('Paris');
    await choose(page, 'Profession', 'Psychologue');
    await search.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page).toHaveURL(/\/fr\/annuaire\?.*ville=Paris/);
    await expect(page).toHaveURL(/profession=psychologist/);
    await expect(page.locator('.results-head .count')).toContainText('à Paris');
    const card = page.locator('pm-practitioner-card').filter({ hasText: practitioner.displayName });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Profil vérifié');
    await expect(card).toContainText('Psychologue');

    // Filtre par spécialité (liste fermée) : la fiche reste, les compteurs suivent.
    await choose(page, 'Spécialité', /^Burn-out/);
    await expect(page).toHaveURL(/specialite=burnout/);
    await expect(card).toBeVisible();
    const psychologues = page
      .getByRole('complementary', { name: 'Filtres' })
      .locator('mat-checkbox')
      .filter({ hasText: 'Psychologue' });
    await expect(psychologues).toContainText(/\d+/);
    await expectNoAxeViolations(page);

    // Fiche : identité, pratique, contacts affichés, cabinet.
    await card.getByRole('link', { name: `Voir la fiche ${practitioner.displayName}` }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/praticiens/${practitioner.slug}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: practitioner.displayName }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`${practitioner.displayName} · Psychologue · Paris · PsyMate`);
    await expect(page.getByText('Profil vérifié')).toBeVisible();
    await expect(page.locator('.practice')).toContainText('Burn-out');
    await expect(page.locator('.means')).toContainText('01 23 45 67 89');
    await expect(page.locator('address')).toContainText('12 rue de la Roquette');
    await expect(page.locator('body')).not.toContainText(EMERGENCY);
    await expectNoAxeViolations(page);

    // Formulaire : consentement, envoi, 202, confirmation.
    const token = `flux7-${Date.now()}`;
    const contact = page.locator('#contact');
    await contact.getByLabel('Votre nom').fill('Sam Visiteur');
    await contact.getByLabel('Votre e-mail').fill('sam.visiteur@example.test');
    await contact
      .getByLabel('Message', { exact: true })
      .fill(`Bonjour, avez-vous un créneau en soirée ? ${token}`);
    await contact.getByRole('checkbox', { name: /J'accepte que mes coordonnées/ }).check();
    const sent = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/practitioners/${practitioner.slug}/contact`) &&
        r.request().method() === 'POST',
    );
    await contact.getByRole('button', { name: 'Envoyer le message' }).click();
    const response = await sent;
    expect(response.status(), 'au-delà de 5 envois par heure et par IP : 429 (G Q24)').toBe(202);
    const body = response.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({ consent: true, name: 'Sam Visiteur' });
    expect(body['website']).toBeUndefined();
    expect(Date.parse(String(body['formShownAt']))).toBeLessThan(Date.now());
    await expect(contact.getByRole('status')).toContainText(
      `Votre message a été transmis à ${practitioner.displayName}.`,
    );
    await expectNoAxeViolations(page);

    // Mailpit : le message relayé au praticien, avec nom, e-mail et texte du visiteur.
    await expect
      .poll(async () => (await mailpitSearch(request, token)).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const [mail] = await mailpitSearch(request, token);
    const full = (await (await request.get(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
      To: { Address: string }[];
      Text: string;
    };
    expect(full.To.map((to) => to.Address)).toContain(practitioner.contactEmail);
    expect(full.Text).toContain('Sam Visiteur');
    expect(full.Text).toContain('sam.visiteur@example.test');

    expect(patientCalls).toEqual([]);
  });

  test('au clavier : recherche, facette, « Contacter » mène au formulaire de la fiche', async ({
    page,
  }) => {
    await page.goto('/fr/annuaire');
    await expect(page.locator('pm-practitioner-card').first()).toBeVisible();

    // Entrée dans le champ Ville lance la recherche.
    const city = page.getByRole('search').getByLabel('Ville');
    await city.focus();
    await page.keyboard.type('Paris');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/ville=Paris/);

    // Espace sur une facette : filtre appliqué après 300 ms, URL à jour.
    const accepting = page
      .getByRole('complementary', { name: 'Filtres' })
      .getByRole('checkbox', { name: 'Accepte de nouveaux patients' });
    await accepting.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/accepte=oui/);

    // « Contacter » d'une fiche résumée : la fiche s'ouvre sur son formulaire, focus sur son titre.
    const card = page.locator('pm-practitioner-card').filter({ hasText: practitioner.displayName });
    await card.getByRole('link', { name: `Contacter ${practitioner.displayName}` }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/fr/praticiens/${practitioner.slug}#contact$`));
    const title = page.getByRole('heading', {
      name: `Envoyer un message à ${practitioner.displayName}`,
    });
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Votre nom')).toBeFocused();
    await page.keyboard.type('Sam Visiteur');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Votre e-mail')).toBeFocused();

    // « Prendre contact » depuis le haut de la fiche : même destination.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('link', { name: 'Prendre contact' }).focus();
    await page.keyboard.press('Enter');
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    await expectNoAxeViolations(page);
  });

  test('piège à robots rempli : 202 silencieux, rien dans Mailpit', async ({ page, request }) => {
    await page.goto(`/fr/praticiens/${practitioner.slug}`);
    const contact = page.locator('#contact');
    await expect(contact.getByLabel('Votre nom')).toBeVisible();
    const token = `flux7-robot-${Date.now()}`;
    await contact.getByLabel('Votre nom').fill('Robot');
    await contact.getByLabel('Votre e-mail').fill('robot@example.test');
    await contact.getByLabel('Message', { exact: true }).fill(`Offre exceptionnelle ${token}`);
    await contact.getByRole('checkbox', { name: /J'accepte que mes coordonnées/ }).check();
    // Le champ caché, qu'un humain ne voit ni n'atteint au clavier, rempli comme le ferait un robot.
    await page.locator('#contact-website').fill('https://spam.example.test', { force: true });
    const sent = page.waitForResponse(
      (r) => r.url().endsWith('/contact') && r.request().method() === 'POST',
    );
    await contact.getByRole('button', { name: 'Envoyer le message' }).click();
    const response = await sent;
    expect(response.status(), 'au-delà de 5 envois par heure et par IP : 429 (G Q24)').toBe(202);
    expect(response.request().postDataJSON()).toMatchObject({
      website: 'https://spam.example.test',
    });
    // Rien ne distingue l'envoi ignoré pour le visiteur.
    await expect(contact.getByRole('status')).toContainText('Votre message a été transmis');
    // Le relais est asynchrone : on laisse le temps à un éventuel e-mail d'arriver.
    await page.waitForTimeout(4000);
    expect(await mailpitSearch(request, token)).toEqual([]);
  });
});

test.describe('pages publiques sans données', () => {
  test('fiche inconnue : « Fiche introuvable », non indexée', async ({ page }) => {
    await page.goto('/fr/praticiens/personne-inconnue-e2e');
    await expect(page.getByRole('heading', { level: 1, name: 'Fiche introuvable' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await page.getByRole('link', { name: "Retour à l'annuaire" }).click();
    await expect(page).toHaveURL(/\/fr\/annuaire$/);
    await expectNoAxeViolations(page);
  });

  test('comment ça marche : HTML prérendu complet (sans JavaScript), indexable, sans agenda ni urgence', async ({
    browser,
    page,
    request,
  }) => {
    // Le HTML servi contient déjà le contenu et les balises (prérendu au build).
    const html = await (await request.get('/fr/comment-ca-marche')).text();
    expect(html).toContain('Un outil de suivi pour les praticiens');
    expect(html).toContain('Questions fréquentes');
    expect(html).toMatch(/<meta name="robots" content="index,follow">/);
    expect(html).toMatch(/<link rel="canonical" href="\/fr\/comment-ca-marche"/);

    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: test.info().project.use.baseURL,
    });
    const staticPage = await noJs.newPage();
    await staticPage.goto('/fr/comment-ca-marche');
    await expect(staticPage.getByRole('heading', { level: 1 })).toContainText(
      'Un outil de suivi pour les praticiens',
    );
    await expect(staticPage.locator('ol > li')).toHaveCount(4);
    await expect(staticPage.locator('details[open]')).toHaveCount(2);
    await noJs.close();

    await page.goto('/fr/comment-ca-marche');
    await expect(page.locator('body')).not.toContainText(/google|agenda|signal/i);
    await expect(page.locator('body')).not.toContainText(EMERGENCY);
    await page.getByRole('link', { name: "Parcourir l'annuaire" }).click();
    await expect(page).toHaveURL(/\/fr\/annuaire$/);
    await page.goto('/fr/comment-ca-marche');
    await expectNoAxeViolations(page);
  });

  test('annuaire prérendu : formulaire et balises dans le HTML, résultats chargés après hydratation', async ({
    request,
  }) => {
    const html = await (await request.get('/fr/annuaire')).text();
    expect(html).toContain('Trouver un psychologue, un psychiatre ou un coach');
    expect(html).toContain('role="search"');
    expect(html).toMatch(/<meta name="robots" content="index,follow">/);
    expect(html).toMatch(/<link rel="canonical" href="\/fr\/annuaire"/);
    // Aucune donnée de l'API au prérendu : ni fiche, ni erreur, le squelette seulement.
    expect(html).not.toContain('pm-practitioner-card');
    expect(html).not.toContain('role="alert"');
    const english = await (await request.get('/en/annuaire')).text();
    expect(english).toContain('Find a psychologist, a psychiatrist or a coach');
  });

  for (const path of [
    '/fr/annuaire',
    '/fr/comment-ca-marche',
    '/fr/praticiens/personne-inconnue-e2e',
  ]) {
    test(`390 px : pas de défilement horizontal sur ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      if (path === '/fr/annuaire') {
        const toggle = page.getByRole('button', { name: /^Filtres \(\d+\)$/ });
        await expect(toggle).toBeVisible();
        await expect(page.getByRole('complementary', { name: 'Filtres' })).toBeHidden();
        await toggle.click();
        await expect(page.getByRole('complementary', { name: 'Filtres' })).toBeVisible();
      }
      await expectNoAxeViolations(page);
    });
  }
});
