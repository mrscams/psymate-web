import { expect, Page, Response, test } from '@playwright/test';

import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly } from '../support/clavier';
import { expectNoHorizontalScroll } from './page-publique-support';
import {
  agendaAppointmentsOf,
  ApiCall,
  cancelByLink,
  createRequest,
  CreatedRequest,
  expectedDetail,
  expectTokensNowhere,
  linkToken,
  MODALITY_LABELS,
  recordApiCalls,
} from './par-lien-support';

// Fiche 32 (M14-13) : pages par lien de la prise de rendez-vous, contre l'API réelle et Mailpit.
//
// Budget de créations : l'API plafonne POST …/requests à 5 par heure et par IP, et la CI joue toute
// la suite depuis une seule IP (page-publique.spec.ts en consomme une). Ce fichier en fait DEUX : une
// chez claire-martin (mode manuel), une chez karim-haddad (mode automatique), chacune dans son
// parcours en série. Chaque parcours se termine par l'annulation de son rendez-vous (afterAll en
// filet) pour libérer le créneau. Les autres états (410, 409, 422, 429, pannes, passé, fiche
// dépubliée) sont couverts par les tests Vitest des pages et du store (service simulé). Un jeton
// inventé donne un vrai 404 sans rien créer : il est joué ici.

const MANUAL = 'claire-martin';
const AUTO = 'karim-haddad';
const KARIM = { email: 'karim.seed@example.test', password: SEED.claire.password };

const VERIFY = '/api/public/booking/requests/verify';
const MANAGE = '/api/public/booking/manage';
const CANCEL = '/api/public/booking/manage/cancel';

const EMERGENCY = "PsyMate n'est pas un service d'urgence.";
const FALLBACK =
  "Pour suivre ou annuler votre demande, utilisez le lien de l'e-mail que nous vous avons envoyé.";

const isPost = (path: string) => (response: Response) =>
  response.request().method() === 'POST' && new URL(response.url()).pathname === path;

const posts = (calls: ApiCall[], path: string) =>
  calls.filter((call) => call.method === 'POST' && new URL(call.url).pathname === path);

/** Vrai si `a` précède `b` dans l'ordre du document. */
async function precedes(page: Page, a: string, b: string): Promise<boolean> {
  return page.evaluate(
    ([first, second]) => {
      const x = document.querySelector(first);
      const y = document.querySelector(second);
      return !!x && !!y && !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    [a, b],
  );
}

async function expectMeta(page: Page): Promise<void> {
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
}

/** Détail du rendez-vous : praticien (lien rel=noreferrer), date, heure nommée, durée, modalité. */
async function expectDetail(page: Page, request: CreatedRequest): Promise<void> {
  const { day, hours } = expectedDetail(request.slot);
  const values = page.locator('pm-booking-link-detail dd');
  await expect(page.locator('pm-booking-link-detail dt')).toHaveText([
    'Praticien',
    'Date',
    'Heure',
    'Durée',
    'Modalité',
  ]);
  await expect(values.nth(0)).toHaveText(request.displayName);
  await expect(values.nth(0).locator('a')).toHaveAttribute(
    'href',
    `/fr/praticiens/${request.slug}`,
  );
  await expect(values.nth(0).locator('a')).toHaveAttribute('rel', 'noreferrer');
  await expect(values.nth(1)).toHaveText(day);
  await expect(values.nth(2).locator('.mono')).toHaveText(hours);
  await expect(values.nth(2).locator('.tz')).toHaveText('heure de votre appareil, Europe/Paris');
  await expect(values.nth(3)).toHaveText(`${request.durationMin} min`);
  await expect(values.nth(4)).toHaveText(MODALITY_LABELS[request.modality]);
}

/** Ouvre la page de vérification et rend la réponse de POST …/requests/verify. */
async function openVerify(
  page: Page,
  token: string,
): Promise<{ body: unknown; manageToken: string | null; status: number }> {
  const answered = page.waitForResponse(isPost(VERIFY));
  await page.goto(`/fr/rendez-vous/confirmer/${token}`);
  const response = await answered;
  const json = (await response.json()) as { manageToken?: string | null };
  return {
    body: response.request().postDataJSON(),
    manageToken: json.manageToken ?? null,
    status: response.status(),
  };
}

test.describe('pages par lien, jeton inconnu (fiche 32, aucune création)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`vérification : 404 BOOKING_TOKEN_INVALID → « Lien inconnu », thème ${theme}, 390 et 720 px`, async ({
      page,
    }) => {
      const token = `inconnu-m14-13-${Date.now()}`;
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 900 });
      const calls = recordApiCalls(page);
      const answered = page.waitForResponse(isPost(VERIFY));
      await page.goto(`/fr/rendez-vous/confirmer/${token}`);
      expect((await answered).status()).toBe(404);
      await expect(page).toHaveTitle('Votre demande de rendez-vous · PsyMate');
      const title = page.getByRole('heading', { level: 1 });
      await expect(title).toHaveText("Ce lien n'est plus valable");
      await expect(title).toBeFocused();
      await expect(page.locator('.head')).toHaveAttribute('role', 'alert');
      await expect(page.locator('.text')).toHaveText(
        'Nous ne reconnaissons pas ce lien : il est peut-être incomplet, ou la demande a été effacée.',
      );
      const directory = page.getByRole('link', { name: "Retrouver le praticien dans l'annuaire" });
      await expect(directory).toHaveAttribute('href', '/fr/annuaire');
      await expect(directory).toHaveAttribute('rel', 'noreferrer');
      await expect(page.locator('pm-emergency-note')).toContainText(EMERGENCY);
      expect(await precedes(page, 'pm-emergency-note', '.actions a')).toBe(true);
      await expectMeta(page);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
      await page.setViewportSize({ width: 720, height: 900 });
      await expectNoHorizontalScroll(page);
      await expectTokensNowhere(page, calls, [token]);
      // Quitter la page retire la balise referrer.
      await directory.click();
      await expect(page).toHaveURL(/\/fr\/annuaire$/);
      await expect(page.locator('meta[name="referrer"]')).toHaveCount(0);
    });

    test(`gestion : 404 → « Ce lien n'est plus valable », jamais « expiré », thème ${theme}`, async ({
      page,
    }) => {
      const token = `inconnu-m14-13-${Date.now()}`;
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 900 });
      const calls = recordApiCalls(page);
      const answered = page.waitForResponse(isPost(MANAGE));
      await page.goto(`/fr/rendez-vous/gerer/${token}`);
      expect((await answered).status()).toBe(404);
      await expect(page).toHaveTitle('Votre rendez-vous · PsyMate');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        "Ce lien n'est plus valable",
      );
      await expect(page.locator('.text')).toHaveText('Utilisez le lien du dernier e-mail reçu.');
      await expect(page.locator('main')).not.toContainText('expiré');
      await expectMeta(page);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
      await page.setViewportSize({ width: 720, height: 900 });
      await expectNoHorizontalScroll(page);
      await expectTokensNowhere(page, calls, [token]);
    });
  }
});

test.describe('parcours réel, mode manuel (claire-martin) : demande transmise, gestion, annulation', () => {
  test.describe.configure({ mode: 'serial' });

  let request: CreatedRequest;
  let verifyToken: string;
  let manageToken: string | null = null;

  test.afterAll(async ({ playwright }) => {
    if (!manageToken) return;
    const api = await playwright.request.newContext();
    await cancelByLink(api, manageToken);
    await api.dispose();
  });

  test('demande créée, lien lu dans Mailpit : « Votre demande est transmise », détail, « Gérer ma demande »', async ({
    page,
    request: api,
  }) => {
    test.setTimeout(90_000);
    request = await createRequest(api, MANUAL, 'm14-13.manuel');
    verifyToken = await linkToken(api, request.email, 'confirmer');

    const calls = recordApiCalls(page);
    const verified = await openVerify(page, verifyToken);
    expect(verified.status).toBe(200);
    // Le jeton voyage dans le corps de POST …/verify, jamais dans l'URL.
    expect(verified.body).toEqual({ token: verifyToken });
    expect(verified.manageToken).toBeTruthy();
    manageToken = verified.manageToken;

    await expect(page).toHaveTitle('Votre demande de rendez-vous · PsyMate');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Votre demande est transmise');
    await expect(title).toBeFocused();
    await expect(page.locator('.head')).toHaveAttribute('role', 'status');
    await expect(page.locator('.text p').first()).toHaveText(
      "Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.",
    );
    await expectDetail(page, request);
    const manage = page.getByRole('link', { name: 'Gérer ma demande' });
    await expect(manage).toHaveAttribute('href', `/fr/rendez-vous/gerer/${manageToken}`);
    await expect(manage).toHaveAttribute('rel', 'noreferrer');
    expect(await precedes(page, 'pm-emergency-note', '.actions a')).toBe(true);
    await expect(page.locator('pm-emergency-note a[href="tel:112"]')).toBeVisible();
    await expect(page.locator('pm-emergency-note a[href="tel:3114"]')).toBeVisible();
    await expectMeta(page);
    await expectNoAxeViolations(page);

    // « Gérer ma demande » : la page de gestion lit l'état par POST …/manage, jeton dans le corps.
    const managed = page.waitForResponse(isPost(MANAGE));
    await manage.click();
    const managedResponse = await managed;
    expect(managedResponse.status()).toBe(200);
    expect(managedResponse.request().postDataJSON()).toEqual({ token: manageToken });
    await expect(page).toHaveTitle('Votre rendez-vous · PsyMate');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Votre demande de rendez-vous',
    );
    await expect(page.locator('.pill')).toHaveText('En attente de réponse');
    await expect(page.getByRole('button', { name: 'Annuler ma demande' })).toBeVisible();
    await expectMeta(page);
    await expectNoAxeViolations(page);
    await expectTokensNowhere(page, calls, [verifyToken, manageToken!]);
  });

  test('recharger la vérification : même état, sans lien de gestion, un seul rendez-vous dans l’agenda', async ({
    page,
    request: api,
  }) => {
    const calls = recordApiCalls(page);
    const again = await openVerify(page, verifyToken);
    expect(again.status).toBe(200);
    expect(again.manageToken).toBeNull();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre demande est transmise');
    await expect(page.locator('.secondary')).toHaveText(FALLBACK);
    await expect(page.getByRole('link', { name: 'Gérer ma demande' })).toHaveCount(0);

    // Rechargement du navigateur : même appel, même état.
    const reloaded = page.waitForResponse(isPost(VERIFY));
    await page.reload();
    expect((await reloaded).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre demande est transmise');
    await expect(page.locator('.secondary')).toHaveText(FALLBACK);
    await expectDetail(page, request);

    // Un seul rendez-vous en ligne pour cette adresse, à confirmer.
    const appointments = await agendaAppointmentsOf(api, SEED.claire, request.email, request.slot);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('tentative');
    await expectTokensNowhere(page, calls, [verifyToken, manageToken!]);
  });

  test('gestion : « Garder » n’envoie rien ; confirmer annule puis relit, la pastille devient « Annulé »', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const calls = recordApiCalls(page);
    const loaded = page.waitForResponse(isPost(MANAGE));
    await page.goto(`/fr/rendez-vous/gerer/${manageToken}`);
    expect((await loaded).status()).toBe(200);
    await expect(page.locator('.pill')).toHaveText('En attente de réponse');
    await expect(page.locator('.text')).toHaveText('Le praticien vous répondra par e-mail.');
    await expectDetail(page, request);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 720, height: 900 });
    await expectNoHorizontalScroll(page);

    const cancel = page.getByRole('button', { name: 'Annuler ma demande' });
    await cancel.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Annuler cette demande ?');
    await expect(dialog).toContainText(
      'Le praticien sera prévenu par e-mail. Pour un autre créneau, il faudra refaire une demande.',
    );
    await expect(dialog.locator('input, textarea, select')).toHaveCount(0);
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Garder' }).click();
    await expect(dialog).toHaveCount(0);
    expect(posts(calls, CANCEL)).toHaveLength(0);
    await expect(page.locator('.pill')).toHaveText('En attente de réponse');

    await cancel.click();
    const cancelled = page.waitForResponse(isPost(CANCEL));
    const reread = page.waitForResponse(isPost(MANAGE));
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler la demande' }).click();
    const cancelResponse = await cancelled;
    expect(cancelResponse.status()).toBe(200);
    expect(cancelResponse.request().postDataJSON()).toEqual({ token: manageToken });
    expect((await reread).status()).toBe(200);
    await expect(page.locator('.pill')).toHaveText('Annulé');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.locator('.text')).toHaveText('Vous avez annulé ce rendez-vous.');
    await expect(page.getByRole('button', { name: /Annuler/ })).toHaveCount(0);
    await expectNoAxeViolations(page);
    // Annulation suivie d'une relecture (jamais de correction locale).
    const order = calls
      .filter((c) => c.method === 'POST')
      .map((c) => new URL(c.url).pathname)
      .slice(-2);
    expect(order).toEqual([CANCEL, MANAGE]);
    await expectTokensNowhere(page, calls, [verifyToken, manageToken!]);

    // « Choisir un autre créneau » mène aux créneaux du praticien ; la balise referrer disparaît.
    const rebook = page.getByRole('link', { name: 'Choisir un autre créneau' });
    await expect(rebook).toHaveAttribute('href', `/fr/praticiens/${MANUAL}/rendez-vous`);
    await expect(rebook).toHaveAttribute('rel', 'noreferrer');
    await rebook.click();
    await expect(page).toHaveURL(new RegExp(`/fr/praticiens/${MANUAL}/rendez-vous$`));
    await expect(page.locator('meta[name="referrer"]')).toHaveCount(0);
    manageToken = null;
  });
});

test.describe('parcours réel, mode automatique (karim-haddad) : rendez-vous confirmé, annulation au clavier', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ colorScheme: 'dark' });

  let request: CreatedRequest;
  let verifyToken: string;
  let manageToken: string | null = null;

  test.afterAll(async ({ playwright }) => {
    if (!manageToken) return;
    const api = await playwright.request.newContext();
    await cancelByLink(api, manageToken);
    await api.dispose();
  });

  test('demande créée, lien lu dans Mailpit : « Votre rendez-vous est confirmé » (thème sombre, 390 px)', async ({
    page,
    request: api,
  }) => {
    test.setTimeout(90_000);
    request = await createRequest(api, AUTO, 'm14-13.auto');
    verifyToken = await linkToken(api, request.email, 'confirmer');

    await page.setViewportSize({ width: 390, height: 900 });
    const calls = recordApiCalls(page);
    const verified = await openVerify(page, verifyToken);
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ token: verifyToken });
    manageToken = verified.manageToken;
    expect(manageToken).toBeTruthy();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Votre rendez-vous est confirmé');
    await expect(title).toBeFocused();
    await expect(page.locator('.text p').first()).toHaveText(
      'Vous recevez un e-mail de confirmation avec le lien pour le gérer.',
    );
    await expectDetail(page, request);
    await expect(page.getByRole('link', { name: 'Gérer mon rendez-vous' })).toHaveAttribute(
      'href',
      `/fr/rendez-vous/gerer/${manageToken}`,
    );
    await expectMeta(page);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 720, height: 900 });
    await expectNoHorizontalScroll(page);
    await expectTokensNowhere(page, calls, [verifyToken, manageToken!]);
  });

  test('recharger : même état, phrase de repli, un seul rendez-vous planifié dans l’agenda', async ({
    page,
    request: api,
  }) => {
    await openVerify(page, verifyToken);
    const reloaded = page.waitForResponse(isPost(VERIFY));
    await page.reload();
    const response = await reloaded;
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { manageToken?: string | null }).manageToken).toBeNull();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Votre rendez-vous est confirmé',
    );
    await expect(page.locator('.secondary')).toHaveText(FALLBACK);
    await expect(page.getByRole('link', { name: 'Gérer mon rendez-vous' })).toHaveCount(0);
    const appointments = await agendaAppointmentsOf(api, KARIM, request.email, request.slot);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('planned');
  });

  test('annulation au clavier seul : h1, praticien, 112, 3114, bouton ; dialogue piégé ; Échap ; Entrée', async ({
    page,
  }) => {
    const guard = await keyboardOnly(page);
    const calls = recordApiCalls(page);
    const loaded = page.waitForResponse(isPost(MANAGE));
    await page.goto(`/fr/rendez-vous/gerer/${manageToken}`);
    expect((await loaded).status()).toBe(200);
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Votre rendez-vous');
    await expect(page.locator('.pill')).toHaveText('Confirmé');
    await expect(title).toBeFocused();

    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      });
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      order.push(await focused());
    }
    expect(order).toEqual([request.displayName, '112', '3114', 'Annuler mon rendez-vous']);

    // Entrée ouvre le dialogue, le focus y entre et n'en sort pas.
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Annuler ce rendez-vous ?');
    await expect(dialog.getByRole('button', { name: 'Garder' })).toBeFocused();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
        true,
      );
    }
    await expectNoAxeViolations(page);
    // Échap ferme sans requête et rend le focus au bouton.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const cancelButton = page.getByRole('button', { name: 'Annuler mon rendez-vous' });
    await expect(cancelButton).toBeFocused();
    expect(posts(calls, CANCEL)).toHaveLength(0);

    // Rouvert, Entrée sur « Annuler le rendez-vous » envoie l'annulation.
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('button', { name: 'Garder' })).toBeFocused();
    await page.keyboard.press('Tab');
    const confirm = dialog.getByRole('button', { name: 'Annuler le rendez-vous' });
    await expect(confirm).toBeFocused();
    const cancelled = page.waitForResponse(isPost(CANCEL));
    const reread = page.waitForResponse(isPost(MANAGE));
    await page.keyboard.press('Enter');
    expect((await cancelled).status()).toBe(200);
    expect((await reread).status()).toBe(200);
    await expect(page.locator('.pill')).toHaveText('Annulé');
    await expect(title).toBeFocused();
    await expect(page.locator('.text')).toHaveText('Vous avez annulé ce rendez-vous.');
    guard.expectNoPointer();
    await expectNoAxeViolations(page);
    await expectTokensNowhere(page, calls, [verifyToken, manageToken!]);
    manageToken = null;
  });
});
