import { expect, Page, test } from '@playwright/test';

import { uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly } from '../support/clavier';
import { MAILPIT } from '../support/env';
import {
  AUTO,
  expectedDays,
  expectNoHorizontalScroll,
  MANUAL,
  MODE,
  nextSlots,
  precedes,
  shownDays,
} from './page-publique-support';

// Fiche 31 (M14-12) : page publique de prise de rendez-vous, contre l'API réelle et le seed small.
//
// Budget de créations : l'API plafonne POST …/requests à 5 par heure et par IP, et la CI joue toute
// la suite depuis une seule IP. Ce fichier n'en fait qu'UNE (« envoi complet », sur claire-martin).
// Les autres cas (forme invalide, consentement, mode automatique) s'arrêtent avant toute requête ;
// 409, 422 et 429 sont couverts par les tests Vitest du store et de la page (service simulé).
//
// La CI joue la suite en parallèle et d'autres tests prennent des créneaux : rien ici ne suppose un
// nombre de créneaux, l'écran est comparé à la réponse de l'API captée sur la même page.

const POST_REQUESTS = /\/api\/public\/booking\/practitioners\/[^/]+\/requests$/;

/** Compte les POST de demande partis de la page (aucun ne doit partir sur une forme invalide). */
function countRequests(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && POST_REQUESTS.test(new URL(request.url()).pathname)) {
      count++;
    }
  });
  return () => count;
}

test.describe('prise de rendez-vous publique (fiche 31)', () => {
  test.describe('navigateur dans un autre fuseau que le praticien', () => {
    test.use({ timezoneId: 'America/New_York' });

    test('fiche → « Prendre rendez-vous » ; créneaux de l’API, groupés par jour, heure du praticien ; fenêtres de 14 jours', async ({
      page,
    }) => {
      await page.goto(`/fr/praticiens/${MANUAL}`);
      const actions = page.locator('.identity .actions');
      const booking = actions.getByRole('link', { name: 'Prendre rendez-vous' });
      await expect(booking).toBeVisible();
      // « Prendre rendez-vous » est le bouton plein, avant « Prendre contact » qui passe en contour.
      await expect(actions.locator('a, button').first()).toHaveText('Prendre rendez-vous');
      await expect(booking).toHaveAttribute('mat-flat-button');
      await expect(actions.getByRole('link', { name: 'Prendre contact' })).toHaveAttribute(
        'mat-stroked-button',
      );
      await expectNoAxeViolations(page);

      const first = nextSlots(page, MANUAL);
      const settings = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname.endsWith(`/api/public/booking/practitioners/${MANUAL}`),
      );
      await booking.click();
      const { horizonDays } = (await (await settings).json()) as { horizonDays: number };
      await expect(page).toHaveURL(new RegExp(`/fr/praticiens/${MANUAL}/rendez-vous$`));
      await expect(page).toHaveTitle('Prendre rendez-vous · PsyMate');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Prendre rendez-vous avec Claire Martin',
      );
      await expect(page.locator('.head-card pm-booking-bar')).toHaveText(MODE.manual);

      const response = await first;
      const from = response.url.searchParams.get('from')!;
      const to = response.url.searchParams.get('to')!;
      expect(daysBetween(from, to)).toBe(13);
      // Fuseau nommé à l'écran, en toutes lettres.
      await expect(page.locator('.period-text')).toContainText(
        `Heures du praticien : ${response.timezone} (`,
      );
      const expected = expectedDays(response);
      if (expected.length) {
        await expect(page.locator('button.slot').first()).toBeVisible();
        expect(await shownDays(page)).toEqual(expected);
      } else {
        await expect(page.getByText("Aucun créneau disponible pour l'instant")).toBeVisible();
      }

      // La mention d'urgence (112, 3114) précède les boutons de créneau.
      const note = page.locator('pm-emergency-note');
      await expect(note).toContainText("PsyMate n'est pas un service d'urgence.");
      await expect(note.locator('a[href="tel:112"]')).toBeVisible();
      await expect(note.locator('a[href="tel:3114"]')).toBeVisible();
      if (expected.length)
        expect(await precedes(page, 'pm-emergency-note', 'button.slot')).toBe(true);

      // Fenêtres : « précédentes » inactif d'abord ; chaque fenêtre fait 14 jours ; « suivantes »
      // s'arrête quand la fenêtre suivante commencerait après aujourd'hui + horizon (28 j).
      const previous = page.getByRole('button', { name: 'Semaines précédentes' });
      const next = page.getByRole('button', { name: 'Semaines suivantes' });
      await expect(previous).toBeDisabled();
      let windows = 0;
      while (await next.isEnabled()) {
        const pending = nextSlots(page, MANUAL);
        await next.click();
        const window = await pending;
        windows++;
        const start = window.url.searchParams.get('from')!;
        expect(daysBetween(from, start)).toBe(14 * windows);
        expect(daysBetween(start, window.url.searchParams.get('to')!)).toBe(13);
        const days = expectedDays(window);
        if (days.length) {
          await expect(page.locator('button.slot').first()).toBeVisible();
          expect(await shownDays(page)).toEqual(days);
        } else {
          // Fenêtre sans créneau : liste vide, pas une erreur, et le lien vers le contact.
          await expect(page.getByText("Aucun créneau disponible pour l'instant")).toBeVisible();
          await expect(page.getByRole('link', { name: 'Prendre contact' })).toHaveAttribute(
            'href',
            new RegExp(`/praticiens/${MANUAL}#contact$`),
          );
        }
        await expect(previous).toBeEnabled();
      }
      // Fenêtres suivantes tant que leur premier jour ne dépasse pas aujourd'hui + horizonDays.
      expect(windows).toBe(Math.floor(horizonDays / 14));
      await expectNoAxeViolations(page);
    });
  });

  test('praticien sans prise de rendez-vous (404 BOOKING_NOT_AVAILABLE) : retour à sa fiche', async ({
    page,
  }) => {
    await page.goto('/fr/praticiens/aucune-fiche-m14-12/rendez-vous');
    await expect(page).toHaveURL(/\/fr\/praticiens\/aucune-fiche-m14-12$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fiche introuvable');
    await expectNoAxeViolations(page);
  });

  test('mode automatique : phrase de G Q61, « Réserver ce créneau » ; forme invalide : aucune requête', async ({
    page,
  }) => {
    const sent = countRequests(page);
    await page.goto(`/fr/praticiens/${AUTO}/rendez-vous`);
    await expect(page.locator('.head-card pm-booking-bar')).toHaveText(MODE.auto);
    const slot = page.locator('button.slot').first();
    await expect(slot.or(page.getByText("Aucun créneau disponible pour l'instant"))).toBeVisible();
    test.skip((await slot.count()) === 0, 'aucun créneau offert dans la première fenêtre');
    await slot.click();
    await expect(page.getByRole('heading', { name: 'Vos coordonnées' })).toBeFocused();
    const form = page.locator('form');
    await expect(form.locator('pm-booking-bar')).toHaveText(MODE.auto);
    const submit = page.getByRole('button', { name: 'Réserver ce créneau' });
    await expect(submit).toBeVisible();
    // Aucun champ libre, aucun « motif » : quatre champs de saisie et le pot de miel caché.
    await expect(form.locator('textarea, select')).toHaveCount(0);
    await expect(form.locator('input:not([type=radio]):not([type=checkbox])')).toHaveCount(5);
    await expect(form).not.toContainText(/motif/i);
    expect(await precedes(page, 'pm-emergency-note', 'button[type="submit"]')).toBe(true);

    // Tout vide : messages sous les champs, focus sur le premier, aucune requête.
    await submit.click();
    await expect(page.getByLabel('Prénom')).toBeFocused();
    await expect(form.getByText('Ce champ est obligatoire.')).toHaveCount(3);
    await expect(form.getByText('Choisissez une modalité.')).toBeVisible();
    await expect(form.getByText('Cochez cette case pour envoyer votre demande.')).toBeVisible();

    // E-mail mal formé.
    await page.getByLabel('Prénom').fill('Sara');
    await page.getByLabel('Nom', { exact: true }).fill('Benali');
    await page.getByLabel('E-mail').fill('sara.benali');
    await form.getByRole('radio').first().check();
    await submit.click();
    await expect(page.getByLabel('E-mail')).toBeFocused();
    await expect(form.getByText('Adresse e-mail invalide.')).toBeVisible();

    // Consentement non coché, le reste valide.
    await page.getByLabel('E-mail').fill('sara.benali@example.test');
    await submit.click();
    await expect(page.getByRole('checkbox')).toBeFocused();
    await expectNoAxeViolations(page);
    expect(sent()).toBe(0);
  });

  test('parcours au clavier seul, jusqu’au focus sur le premier champ en erreur', async ({
    page,
  }) => {
    const sent = countRequests(page);
    const guard = await keyboardOnly(page);
    await page.goto(`/fr/praticiens/${MANUAL}/rendez-vous`);
    const firstSlot = page.locator('button.slot').first();
    await expect(firstSlot).toBeVisible();

    // Tab depuis le haut : lien d'évitement, bandeau, fil d'Ariane, 112, 3114, « Semaines
    // suivantes » (« précédentes », inactif, est sauté), puis le premier créneau.
    const order: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        if (el.classList.contains('skip-link')) return 'skip';
        if (el.closest('.crumbs')) return `crumb:${el.textContent?.trim()}`;
        if (el.closest('pm-emergency-note')) return `tel:${el.textContent?.trim()}`;
        if (el.classList.contains('slot')) return 'slot';
        if (el.closest('header, pm-public-header')) return 'header';
        return el.textContent?.replace(/\s+/g, ' ').trim() ?? el.tagName;
      });
      order.push(focused);
      if (focused === 'slot') break;
    }
    expect(order[0]).toBe('skip');
    const steps = order.filter((step) => step !== 'header');
    expect(steps).toEqual([
      'skip',
      'crumb:Annuaire',
      'crumb:Claire Martin',
      'tel:112',
      'tel:3114',
      'Semaines suivantes',
      'slot',
    ]);
    expect(order.indexOf('header')).toBeGreaterThan(0);

    // Entrée sur un créneau : étape 2, focus sur « Vos coordonnées ».
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Vos coordonnées' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Changer de créneau' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Prénom')).toBeFocused();
    await page.keyboard.type('Sara');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Nom', { exact: true })).toBeFocused();
    await page.keyboard.type('Benali');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('E-mail')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Téléphone (facultatif)')).toBeFocused();
    // Groupe Modalité : flèches pour choisir.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Au cabinet' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'En visio' })).toBeChecked();
    // Consentement : Espace pour cocher.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox')).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: /En savoir plus sur la protection des données/ }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toBeFocused();
    // E-mail laissé vide : Entrée pose le focus sur lui, aucune requête.
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('E-mail')).toBeFocused();
    expect(sent()).toBe(0);
    guard.expectNoPointer();
    await expectNoAxeViolations(page);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 720]) {
      test(`axe-core et largeur : thème ${theme}, ${width} px, étapes 1 et 2`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/fr/praticiens/${MANUAL}/rendez-vous`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          page.locator('button.slot, pm-booking-slots pm-state:not(:has([aria-busy]))').first(),
        ).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
        const slot = page.locator('button.slot').first();
        if ((await slot.count()) === 0) return;
        await slot.click();
        await expect(page.getByRole('heading', { name: 'Vos coordonnées' })).toBeFocused();
        await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
        await expect(page.getByLabel('Prénom')).toBeFocused();
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      });
    }
  }

  test('envoi complet (la seule création de ce fichier) : 202, écran d’attente, e-mail dans Mailpit, rien du visiteur stocké', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const email = uniqueEmail('m14-12.rdv');
    const firstName = 'Saraïa';
    const lastName = `Benali${Date.now() % 100000}`;
    const phone = '06 12 34 56 78';

    await page.goto(`/fr/praticiens/${MANUAL}/rendez-vous`);
    const slot = page.locator('button.slot').first();
    await expect(slot).toBeVisible();
    await slot.click();
    await expect(page.getByRole('heading', { name: 'Vos coordonnées' })).toBeFocused();
    const formShownAfter = Date.now();

    await page.getByLabel('Prénom').fill(firstName);
    await page.getByLabel('Nom', { exact: true }).fill(lastName);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Téléphone (facultatif)').fill(phone);
    await page.getByRole('radio', { name: 'Au cabinet' }).check();
    await page.getByRole('checkbox').check();
    // L'API ignore en silence un envoi fait moins de 3 s après formShownAt.
    const waited = Date.now() - formShownAfter;
    if (waited < 3500) await page.waitForTimeout(3500 - waited);

    const posted = page.waitForRequest(
      (r) => r.method() === 'POST' && POST_REQUESTS.test(new URL(r.url()).pathname),
    );
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && POST_REQUESTS.test(new URL(r.url()).pathname),
    );
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
    const body = (await posted).postDataJSON() as Record<string, unknown>;
    expect((await answered).status()).toBe(202);
    expect(body).toMatchObject({
      modality: 'in_person',
      firstName,
      lastName,
      email,
      phone,
      consent: true,
      locale: 'fr',
    });
    expect(body['website'] ?? '').toBe('');
    expect(typeof body['startsAt']).toBe('string');
    expect(Date.now() - Date.parse(body['formShownAt'] as string)).toBeGreaterThanOrEqual(3000);

    const title = page.getByRole('heading', { level: 1, name: 'Consultez votre boîte mail' });
    await expect(title).toBeFocused();
    await expect(page.getByText('Le lien est valable 30 minutes.')).toBeVisible();
    await expect(page.locator('.recap')).toContainText('au cabinet');
    await expect(page.locator('main')).not.toContainText(email);
    await expect(page.locator('main')).not.toContainText(lastName);
    const back = page.getByRole('link', { name: 'Revenir à la fiche de Claire Martin' });
    await expect(back).toBeVisible();
    expect(await precedes(page, 'pm-emergency-note', '.booking > p a')).toBe(true);
    await expectNoAxeViolations(page);

    // Rien du visiteur dans le stockage du navigateur ni dans l'URL (G Q62).
    const stored = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    for (const value of [firstName, lastName, email, phone, encodeURIComponent(email)]) {
      expect(stored).not.toContain(value);
      expect(page.url()).not.toContain(value);
    }

    // Le lien de vérification arrive dans Mailpit.
    await expect
      .poll(
        async () => {
          const search = await request.get(`${MAILPIT}/api/v1/search`, {
            params: { query: `to:${email}` },
          });
          return ((await search.json()) as { messages?: unknown[] }).messages?.length ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });
});

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
