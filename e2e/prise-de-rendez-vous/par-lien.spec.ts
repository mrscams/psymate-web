import { expect, Page, Response, test } from '@playwright/test';

import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly } from '../support/clavier';
import { expectNoHorizontalScroll } from './page-publique-support';
import {
  agendaAppointmentsOf,
  ApiCall,
  CreatedRequest,
  expectedDetail,
  expectTokensNowhere,
  MODALITY_LABELS,
  Parcours,
  ParcoursState,
  recordApiCalls,
} from './par-lien-support';

// Fiche 32 (M14-13) : pages par lien de la prise de rendez-vous, contre l'API réelle et Mailpit.
//
// Budget de créations : l'API plafonne POST …/requests à 5 par heure et par IP, et la CI joue toute
// la suite depuis une seule IP (page-publique.spec.ts en consomme une). Ce fichier en fait DEUX : une
// chez claire-martin (mode manuel), une chez karim-haddad (mode automatique), chacune dans son
// parcours en série. Chaque parcours se termine par l'annulation de son rendez-vous (afterAll en
// filet) pour libérer le créneau. Au second essai (retries de la CI), un parcours reprend la demande
// du premier essai (fichier de reprise dans test-results/, classe Parcours) : aucune création de plus. Les autres états (410, 409, 422, 429, pannes, passé, fiche
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

/** Page quittée : la balise no-referrer est retirée, la politique strict-origin d'index.html revient. */
async function expectBaseReferrer(page: Page): Promise<void> {
  await expect(page.locator('meta[name="referrer"]')).toHaveCount(1);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin');
}

async function expectMeta(page: Page): Promise<void> {
  await expect(page.locator('meta[name="referrer"]')).toHaveCount(1);
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

/**
 * Ouvre la page de vérification et rend la réponse de POST …/requests/verify. `onManageToken` est
 * appelé dès l'arrivée de la réponse, avant toute assertion et même si la navigation échoue ensuite :
 * l'API ne renvoie le jeton de gestion qu'une fois, il doit rejoindre le fichier de reprise aussitôt.
 */
async function openVerify(
  page: Page,
  token: string,
  onManageToken?: (manageToken: string) => void,
): Promise<{ body: unknown; manageToken: string | null; status: number }> {
  const answered = page.waitForResponse(isPost(VERIFY)).then(async (response) => {
    const json = (await response.json().catch(() => ({}))) as { manageToken?: string | null };
    if (json.manageToken) onManageToken?.(json.manageToken);
    return { response, json };
  });
  await page.goto(`/fr/rendez-vous/confirmer/${token}`);
  const { response, json } = await answered;
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
      await expectBaseReferrer(page);
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

/**
 * Vérification rejouée sur une demande déjà vérifiée (rechargement, ou reprise au second essai) :
 * même état, sans lien de gestion (`manageToken: null`), phrase de repli.
 */
async function expectVerifiedAgain(page: Page, state: ParcoursState, title: string): Promise<void> {
  const again = await openVerify(page, state.verifyToken!);
  expect(again.status).toBe(200);
  expect(again.body).toEqual({ token: state.verifyToken });
  expect(again.manageToken).toBeNull();
  const heading = page.getByRole('heading', { level: 1 });
  if (state.cancelled) {
    await expect(heading).toHaveText('Ce rendez-vous est annulé');
    await expect(page.locator('.text')).toHaveText('Vous avez annulé ce rendez-vous.');
  } else {
    await expect(heading).toHaveText(title);
    await expect(page.locator('.secondary')).toHaveText(FALLBACK);
  }
  await expect(page.locator('a[href*="/rendez-vous/gerer/"]')).toHaveCount(0);
  await expectDetail(page, state.request);
  await expectMeta(page);
  await expectNoAxeViolations(page);
}

/**
 * Page de gestion rejouée à la reprise (second essai) avec le jeton de gestion enregistré : l'état
 * lu par POST …/manage (en attente, confirmé, ou annulé si l'annulation a déjà eu lieu), le bouton
 * d'annulation tant qu'elle est possible, axe-core.
 */
async function expectManagePage(page: Page, state: ParcoursState, pill: string): Promise<void> {
  const loaded = page.waitForResponse(isPost(MANAGE));
  await page.goto(`/fr/rendez-vous/gerer/${state.manageToken}`);
  const response = await loaded;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ token: state.manageToken });
  await expect(page).toHaveTitle('Votre rendez-vous · PsyMate');
  await expect(page.locator('.pill')).toHaveText(state.cancelled ? 'Annulé' : pill);
  await expect(
    page.getByRole('button', { name: /^Annuler mon rendez-vous$|^Annuler ma demande$/ }),
  ).toHaveCount(state.cancelled ? 0 : 1);
  await expectDetail(page, state.request);
  await expectMeta(page);
  await expectNoAxeViolations(page);
}

/** État final d'un parcours dont l'annulation est déjà enregistrée (reprise au second essai). */
async function expectCancelledByVisitor(page: Page, state: ParcoursState): Promise<void> {
  const loaded = page.waitForResponse(isPost(MANAGE));
  await page.goto(`/fr/rendez-vous/gerer/${state.manageToken}`);
  expect((await loaded).status()).toBe(200);
  await expect(page.locator('.pill')).toHaveText('Annulé');
  await expect(page.locator('.text')).toHaveText('Vous avez annulé ce rendez-vous.');
  await expect(page.getByRole('button', { name: /Annuler/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Choisir un autre créneau' })).toHaveAttribute(
    'href',
    `/fr/praticiens/${state.request.slug}/rendez-vous`,
  );
  // Ordre au clavier depuis le titre : praticien, 112, 3114, puis l'action de l'état annulé.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const order: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    order.push(
      await page.evaluate(
        () => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      ),
    );
  }
  expect(order).toEqual([state.request.displayName, '112', '3114', 'Choisir un autre créneau']);
  await expectNoAxeViolations(page);
}

test.describe('parcours réel, mode manuel (claire-martin) : demande transmise, gestion, annulation', () => {
  test.describe.configure({ mode: 'serial' });

  const parcours = new Parcours('manuel');
  let state: ParcoursState;
  let completed = false;

  test.afterAll(async ({ playwright }, info) => {
    const api = await playwright.request.newContext();
    await parcours.finish(api, info, completed);
    await api.dispose();
  });

  test('demande créée, lien lu dans Mailpit : « Votre demande est transmise », détail, « Gérer ma demande »', async ({
    page,
    request: api,
  }, info) => {
    test.setTimeout(90_000);
    ({ state } = await parcours.start(api, info, MANUAL, 'm14-13.manuel'));
    const calls = recordApiCalls(page);

    if (state.manageToken) {
      // Reprise : la première vérification a eu lieu à l'essai précédent. Tout ce qui peut l'être
      // est rejoué : vérification (vue de repli), puis page de gestion par le jeton enregistré.
      await expectVerifiedAgain(page, state, 'Votre demande est transmise');
      await expectManagePage(page, state, 'En attente de réponse');
      await expectTokensNowhere(page, calls, [state.verifyToken!, state.manageToken]);
      return;
    }

    // Le jeton de gestion rejoint le fichier de reprise dès l'arrivée de la réponse.
    const verified = await openVerify(page, state.verifyToken!, (manageToken) => {
      state.manageToken = manageToken;
      parcours.save(info, state);
    });
    expect(verified.status).toBe(200);
    // Le jeton voyage dans le corps de POST …/verify, jamais dans l'URL.
    expect(verified.body).toEqual({ token: state.verifyToken });
    expect(verified.manageToken).toBeTruthy();
    const manageToken = state.manageToken!;

    await expect(page).toHaveTitle('Votre demande de rendez-vous · PsyMate');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Votre demande est transmise');
    await expect(title).toBeFocused();
    await expect(page.locator('.head')).toHaveAttribute('role', 'status');
    await expect(page.locator('.text p').first()).toHaveText(
      "Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.",
    );
    await expectDetail(page, state.request);
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
    await expectTokensNowhere(page, calls, [state.verifyToken!, manageToken]);
  });

  test('recharger la vérification : même état, sans lien de gestion, un seul rendez-vous dans l’agenda', async ({
    page,
    request: api,
  }) => {
    const calls = recordApiCalls(page);
    await expectVerifiedAgain(page, state, 'Votre demande est transmise');

    // Rechargement du navigateur : même appel, même état.
    const reloaded = page.waitForResponse(isPost(VERIFY));
    await page.reload();
    expect((await reloaded).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      state.cancelled ? 'Ce rendez-vous est annulé' : 'Votre demande est transmise',
    );
    await expectDetail(page, state.request);

    // Un seul rendez-vous en ligne pour cette adresse, à confirmer (annulé si l'essai précédent
    // est allé jusque-là).
    const appointments = await agendaAppointmentsOf(
      api,
      SEED.claire,
      state.request.email,
      state.request.slot,
    );
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe(state.cancelled ? 'cancelled' : 'tentative');
    await expectNoAxeViolations(page);
    await expectTokensNowhere(page, calls, [state.verifyToken!, state.manageToken!]);
  });

  test('gestion : « Garder » n’envoie rien ; confirmer annule puis relit, la pastille devient « Annulé »', async ({
    page,
  }, info) => {
    const manageToken = state.manageToken!;
    if (state.cancelled) {
      await expectCancelledByVisitor(page, state);
      completed = true;
      return;
    }
    await page.setViewportSize({ width: 390, height: 900 });
    const calls = recordApiCalls(page);
    const loaded = page.waitForResponse(isPost(MANAGE));
    await page.goto(`/fr/rendez-vous/gerer/${manageToken}`);
    expect((await loaded).status()).toBe(200);
    await expect(page.locator('.pill')).toHaveText('En attente de réponse');
    await expect(page.locator('.text')).toHaveText('Le praticien vous répondra par e-mail.');
    await expectDetail(page, state.request);
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
    state.cancelled = true;
    parcours.save(info, state);
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
    await expectTokensNowhere(page, calls, [state.verifyToken!, manageToken]);

    // « Choisir un autre créneau » mène aux créneaux du praticien ; la politique d'index.html revient.
    const rebook = page.getByRole('link', { name: 'Choisir un autre créneau' });
    await expect(rebook).toHaveAttribute('href', `/fr/praticiens/${MANUAL}/rendez-vous`);
    await expect(rebook).toHaveAttribute('rel', 'noreferrer');
    await rebook.click();
    await expect(page).toHaveURL(new RegExp(`/fr/praticiens/${MANUAL}/rendez-vous$`));
    await expectBaseReferrer(page);
    completed = true;
  });
});

test.describe('parcours réel, mode automatique (karim-haddad) : rendez-vous confirmé, annulation au clavier', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ colorScheme: 'dark' });

  const parcours = new Parcours('auto');
  let state: ParcoursState;
  let completed = false;

  test.afterAll(async ({ playwright }, info) => {
    const api = await playwright.request.newContext();
    await parcours.finish(api, info, completed);
    await api.dispose();
  });

  test('demande créée, lien lu dans Mailpit : « Votre rendez-vous est confirmé » (thème sombre, 390 px)', async ({
    page,
    request: api,
  }, info) => {
    test.setTimeout(90_000);
    ({ state } = await parcours.start(api, info, AUTO, 'm14-13.auto'));
    await page.setViewportSize({ width: 390, height: 900 });
    const calls = recordApiCalls(page);

    if (state.manageToken) {
      // Reprise : la première vérification a eu lieu à l'essai précédent. Tout ce qui peut l'être
      // est rejoué : vérification (vue de repli), puis page de gestion par le jeton enregistré.
      await expectVerifiedAgain(page, state, 'Votre rendez-vous est confirmé');
      await expectManagePage(page, state, 'Confirmé');
      await expectTokensNowhere(page, calls, [state.verifyToken!, state.manageToken]);
      return;
    }

    // Le jeton de gestion rejoint le fichier de reprise dès l'arrivée de la réponse.
    const verified = await openVerify(page, state.verifyToken!, (manageToken) => {
      state.manageToken = manageToken;
      parcours.save(info, state);
    });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ token: state.verifyToken });
    expect(verified.manageToken).toBeTruthy();
    const manageToken = state.manageToken!;
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Votre rendez-vous est confirmé');
    await expect(title).toBeFocused();
    await expect(page.locator('.text p').first()).toHaveText(
      'Vous recevez un e-mail de confirmation avec le lien pour le gérer.',
    );
    await expectDetail(page, state.request);
    await expect(page.getByRole('link', { name: 'Gérer mon rendez-vous' })).toHaveAttribute(
      'href',
      `/fr/rendez-vous/gerer/${manageToken}`,
    );
    await expectMeta(page);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 720, height: 900 });
    await expectNoHorizontalScroll(page);
    await expectTokensNowhere(page, calls, [state.verifyToken!, manageToken]);
  });

  test('recharger : même état, phrase de repli, un seul rendez-vous planifié dans l’agenda', async ({
    page,
    request: api,
  }) => {
    await expectVerifiedAgain(page, state, 'Votre rendez-vous est confirmé');
    const reloaded = page.waitForResponse(isPost(VERIFY));
    await page.reload();
    const response = await reloaded;
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { manageToken?: string | null }).manageToken).toBeNull();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      state.cancelled ? 'Ce rendez-vous est annulé' : 'Votre rendez-vous est confirmé',
    );
    await expect(page.getByRole('link', { name: 'Gérer mon rendez-vous' })).toHaveCount(0);
    const appointments = await agendaAppointmentsOf(
      api,
      KARIM,
      state.request.email,
      state.request.slot,
    );
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe(state.cancelled ? 'cancelled' : 'planned');
    await expectNoAxeViolations(page);
  });

  test('annulation au clavier seul : h1, praticien, 112, 3114, bouton ; dialogue piégé ; Échap ; Entrée', async ({
    page,
  }, info) => {
    if (state.cancelled) {
      await expectCancelledByVisitor(page, state);
      completed = true;
      return;
    }
    const manageToken = state.manageToken!;
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
    expect(order).toEqual([state.request.displayName, '112', '3114', 'Annuler mon rendez-vous']);

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
    state.cancelled = true;
    parcours.save(info, state);
    expect((await reread).status()).toBe(200);
    await expect(page.locator('.pill')).toHaveText('Annulé');
    await expect(title).toBeFocused();
    await expect(page.locator('.text')).toHaveText('Vous avez annulé ce rendez-vous.');
    guard.expectNoPointer();
    await expectNoAxeViolations(page);
    await expectTokensNowhere(page, calls, [state.verifyToken!, manageToken]);
    completed = true;
  });
});
