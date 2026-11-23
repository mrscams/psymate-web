import { expect, Locator, Page, test } from '@playwright/test';

import { MANUAL } from '../prise-de-rendez-vous/page-publique-support';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-11, pages publiques de droite à gauche (G Q71, Q73 à Q77, Q80 ; docs/design/arabe.md §2 à §5,
// §7, §9) : annuaire (résultats, filtres ouverts, aucun résultat), fiche d'un praticien, formulaire
// de contact, prise de rendez-vous (créneaux, coordonnées), « comment ça marche » et pages
// d'information en /ar/, en largeur de bureau puis de téléphone ; dir="rtl", pas de défilement
// horizontal, axe-core sans violation, une capture par écran (PSYMATE_E2E_CAPTURES). Le rendu est
// mesuré (boîtes, ordre des caractères à l'écran), pas seulement les attributs. Aucun libellé ciblé
// en /ar/ (rôles, structure, URL) : ses textes passent du français de repli à l'arabe au fil du
// jalon. Contre l'API locale (seed small), jamais de mock du backend.
//
// Charge sur l'API publique. La CI joue la suite en parallèle (4 workers) depuis une seule IP, et
// l'API plafonne /api/public/** par minute et par IP (60 en production, relevé en CI par la PR 111),
// les demandes de rendez-vous et les messages de contact à 5 par heure et par IP. Ce fichier :
// - n'envoie aucune demande de rendez-vous ni aucun message (formulaires vides ou arrêtés avant
//   l'envoi, compteur de POST à zéro) ;
// - charge chaque page une seule fois et passe du bureau au téléphone par setViewportSize (une
//   douzaine de requêtes publiques en tout) ; les pages statiques n'appellent pas l'API ;
// - tolère un 429 : un GET plafonné est rejoué une fois par l'intercepteur après Retry-After (d'où
//   les attentes longues) ; si l'écran montre encore une erreur, le test est sauté, pas échoué.

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** Assez pour un Retry-After (jusqu'à 60 s) suivi du rejeu automatique du GET. */
const API_WAIT = 75_000;

/** Envois interdits ici : demande de rendez-vous, message de contact. */
const SENDS =
  /\/api\/public\/(booking\/practitioners\/[^/]+\/requests|directory\/practitioners\/[^/]+\/contact)$/;

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: DESKTOP });

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
async function expectRtlPage(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
}

/**
 * Attend le contenu chargé par l'API. Un 429 est rejoué tout seul (attente longue) ; si l'écran
 * finit sur un état d'erreur (plafond encore atteint), le test est sauté.
 */
async function loaded(page: Page, content: Locator): Promise<void> {
  const failed = page.locator('pm-state .state.error, .rate-limited');
  await expect(content.or(failed).first()).toBeVisible({ timeout: API_WAIT });
  if (!(await content.first().isVisible())) {
    await expect(content.first())
      .toBeVisible({ timeout: API_WAIT })
      .catch(() =>
        test.skip(true, 'API publique plafonnée (429) ou indisponible : écran non chargé'),
      );
  }
}

/** Compte les envois (POST) partis de la page : aucun ne doit partir. */
function countSends(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && SENDS.test(new URL(request.url()).pathname)) count++;
  });
  return () => count;
}

/** Passe en largeur de téléphone, sans recharger la page. */
async function toPhone(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

/**
 * Abscisse à l'écran du premier et du dernier caractère visible d'un élément (Range, rendu réel) :
 * un texte en dir="ltr" a son premier caractère à gauche du dernier, même dans une page RTL.
 */
async function firstAndLastX(target: Locator): Promise<{ first: number; last: number }> {
  return target.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.data.trim()) nodes.push(node);
    }
    const rectOf = (node: Text, index: number) => {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      return range.getBoundingClientRect();
    };
    const head = nodes[0];
    const tail = nodes[nodes.length - 1];
    const firstIndex = head.data.search(/\S/);
    const lastIndex = tail.data.length - 1 - [...tail.data].reverse().join('').search(/\S/);
    return { first: rectOf(head, firstIndex).left, last: rectOf(tail, lastIndex).left };
  });
}

/** Le premier élément est entièrement à droite du second (début de ligne en RTL). */
async function expectRightOf(a: Locator, b: Locator): Promise<void> {
  const boxA = await a.boundingBox();
  const boxB = await b.boundingBox();
  expect(boxA, 'premier élément rendu').not.toBeNull();
  expect(boxB, 'second élément rendu').not.toBeNull();
  expect(boxA!.x).toBeGreaterThanOrEqual(boxB!.x + boxB!.width - 1);
}

/** Texte saisi dans une page de droite à gauche : sens rendu du champ. */
async function directionOf(field: Locator): Promise<string> {
  return field.evaluate((el) => getComputedStyle(el).direction);
}

test('comment ça marche : filets et puces du côté du début (à droite), bureau puis téléphone', async ({
  page,
}) => {
  await page.goto('/ar/comment-ca-marche');
  await expect(page.locator('main h1')).toBeVisible();
  await expectRtlPage(page);
  // Garanties : le filet de début de ligne est rendu à droite du texte.
  const border = await page
    .locator('.never li')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return { right: style.borderRightWidth, left: style.borderLeftWidth };
    });
  expect(border).toEqual({ right: '3px', left: '0px' });
  // Listes des deux parcours : retrait du côté droit.
  const padding = await page
    .locator('.path ul')
    .first()
    .evaluate((el) => getComputedStyle(el).paddingRight);
  expect(padding).toBe('20px');
  // Surtitre : pas de capitales forcées en arabe (le nom du produit n'est pas déformé).
  const eyebrow = page.locator('.eyebrow');
  expect(await eyebrow.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
  expect(await eyebrow.innerText()).not.toContain('PSYMATE');
  // Deux parcours côte à côte : le premier à droite du second.
  await expectRightOf(page.locator('.path').first(), page.locator('.path').nth(1));
  await shoot(page, 'arabe-public-comment-ca-marche-bureau');

  await toPhone(page);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-comment-ca-marche-telephone');
});

for (const route of ['mentions-legales', 'confidentialite', 'accessibilite'] as const) {
  test(`page d’information : ${route}, bureau puis téléphone`, async ({ page }) => {
    await page.goto(`/ar/${route}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expectRtlPage(page);
    const pending = page.locator('.pending');
    if (await pending.count()) {
      expect(await pending.evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('4px');
    }
    await shoot(page, `arabe-public-${route}-bureau`);
    await toPhone(page);
    await expectRtlPage(page);
    await shoot(page, `arabe-public-${route}-telephone`);
  });
}

test('annuaire : résultats (bureau, téléphone), filtres ouverts, aucun résultat', async ({
  page,
}) => {
  await page.goto('/ar/annuaire');
  const card = page.locator('pm-practitioner-card').first();
  await loaded(page, card);
  await expectRtlPage(page);
  // Filtres à droite des résultats ; avatar à droite de l'identité, boutons à gauche du corps.
  await expectRightOf(page.locator('aside.filters'), page.locator('section.results'));
  await expectRightOf(card.locator('pm-practitioner-avatar'), card.locator('.identity'));
  await expectRightOf(card.locator('.body'), card.locator('.actions'));
  // Ligne de méta : le premier point de séparation de chaque ligne est rogné (côté droit).
  const clip = await card.locator('.meta').evaluate((el) => {
    const first = el.querySelector('div');
    const box = el.getBoundingClientRect();
    const item = first?.getBoundingClientRect();
    return {
      clipPath: getComputedStyle(el).clipPath,
      // Le premier élément commence au bord droit de la liste, dans la bande rognée.
      startsAtRightEdge: !item || Math.abs(item.right - box.right) < 1,
    };
  });
  expect(clip).toEqual({ clipPath: 'inset(0px 18px 0px 0px)', startsAtRightEdge: true });
  // Champ de recherche : dir="auto", une saisie arabe se lit de droite à gauche.
  const q = page.locator('#directory-q');
  await q.fill('قلق');
  expect(await directionOf(q)).toBe('rtl');
  await q.fill('');
  await shoot(page, 'arabe-public-annuaire-bureau');

  await toPhone(page);
  await expect(page.locator('.filters-toggle')).toBeVisible();
  await expectRtlPage(page);
  await expectRightOf(card.locator('pm-practitioner-avatar'), card.locator('.identity'));
  await shoot(page, 'arabe-public-annuaire-telephone');

  // Filtres ouverts (panneau plein écran sous 760 px) : croix de fermeture à gauche.
  await page.locator('.filters-toggle').click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expectRtlPage(page);
  const panel = await dialog.boundingBox();
  const close = await page.locator('.panel-close').boundingBox();
  expect(close!.x).toBeLessThan(panel!.x + panel!.width / 2);
  await shoot(page, 'arabe-public-annuaire-filtres-telephone');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Aucun résultat : une seule recherche de plus (ville inconnue).
  await page.goto('/ar/annuaire?ville=zzqx-nulle-part');
  await loaded(page, page.locator('.no-results'));
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-annuaire-vide-telephone');
  await page.setViewportSize(DESKTOP);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-annuaire-vide-bureau');
});

test('fiche d’un praticien et formulaire de contact : coordonnées de gauche à droite, aucun envoi', async ({
  page,
}) => {
  const sends = countSends(page);
  await page.goto(`/ar/praticiens/${MANUAL}`);
  await loaded(page, page.locator('#practitioner-name'));
  await expectRtlPage(page);
  // Avatar à droite de l'identité ; colonne des coordonnées à gauche de la colonne principale.
  await expectRightOf(
    page.locator('.identity pm-practitioner-avatar'),
    page.locator('.identity-body'),
  );
  await expectRightOf(page.locator('.main'), page.locator('aside.side'));
  // Téléphone, e-mail, site : premier caractère à gauche du dernier (pas de chiffres retournés).
  for (const link of await page.locator('.means a').all()) {
    const { first, last } = await firstAndLastX(link);
    expect(first).toBeLessThan(last);
  }
  await shoot(page, 'arabe-public-fiche-bureau');

  // Formulaire de contact. Compteur « 0 / 4000 » (avant les erreurs, qui prennent la place des
  // aides) : se lit de gauche à droite.
  const form = page.locator('pm-contact-form form');
  await expect(form).toBeVisible();
  const counter = await firstAndLastX(form.locator('.length span'));
  expect(counter.first).toBeLessThan(counter.last);
  // Nom : dir="auto", de droite à gauche pour une saisie arabe, de gauche à droite sinon.
  const name = form.locator('#field-name');
  await name.fill('سلمى بن علي');
  expect(await directionOf(name)).toBe('rtl');
  await name.fill('Claire');
  expect(await directionOf(name)).toBe('ltr');
  await name.fill('');
  // Nom (premier champ) à droite de l'e-mail.
  await expectRightOf(form.locator('.field').first(), form.locator('.field').nth(1));
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('mat-error').first()).toBeVisible();
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-contact-bureau');

  await toPhone(page);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-fiche-contact-telephone');
  expect(sends()).toBe(0);
});

test('prise de rendez-vous : créneaux ou « aucun créneau », chevrons retournés, coordonnées ; aucune demande', async ({
  page,
}) => {
  const sends = countSends(page);
  await page.goto(`/ar/praticiens/${MANUAL}/rendez-vous`);
  const slot = page.locator('button.slot').first();
  const none = page.locator('pm-booking-slots > div.empty');
  await loaded(page, slot.or(none));
  await expectRtlPage(page);
  // Chevrons des fenêtres : retournés en RTL (« suivant » pointe vers la gauche).
  for (const svg of await page.locator('.period-nav svg').all()) {
    expect(await svg.evaluate((el) => getComputedStyle(el).transform)).toBe(
      'matrix(-1, 0, 0, 1, 0, 0)',
    );
  }
  // D'autres specs prennent des créneaux : on avance d'une fenêtre (au plus deux) s'il n'y en a pas.
  const next = page.locator('.period-nav button').nth(1);
  for (let step = 0; step < 2 && !(await slot.isVisible()); step++) {
    if (!(await next.isEnabled())) break;
    await next.click();
    await loaded(page, slot.or(none));
  }
  if (!(await slot.isVisible())) {
    // Aucun créneau libre sur les fenêtres parcourues : l'état vide est capturé tel quel.
    await expect(none).toBeVisible();
    await shoot(page, 'arabe-public-rendez-vous-aucun-creneau-bureau');
    await toPhone(page);
    await expectRtlPage(page);
    await shoot(page, 'arabe-public-rendez-vous-aucun-creneau-telephone');
    expect(sends()).toBe(0);
    return;
  }
  // Heure du créneau : chiffres latins sur 24 h (Q71, Q73).
  await expect(slot).toHaveText(/^\s*\d{2}:\d{2}\s*$/);
  await shoot(page, 'arabe-public-rendez-vous-creneaux-bureau');
  await toPhone(page);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-rendez-vous-creneaux-telephone');

  await slot.click();
  const form = page.locator('pm-booking-form form');
  await expect(form).toBeVisible();
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await expectRtlPage(page);
  // Plage « 14:00 – 15:00 » isolée en dir="ltr" : début à gauche de la fin.
  const hours = page.locator('.recap .mono');
  await expect(hours).toHaveText(/^\d{2}:\d{2} – \d{2}:\d{2}$/);
  const { first, last } = await firstAndLastX(hours);
  expect(first).toBeLessThan(last);
  // E-mail en dir="ltr" ; prénom en dir="auto" (de droite à gauche pour une saisie arabe).
  expect(await directionOf(form.locator('#field-email'))).toBe('ltr');
  await form.locator('#field-firstName').fill('سلمى');
  expect(await directionOf(form.locator('#field-firstName'))).toBe('rtl');
  await form.locator('#field-firstName').fill('');
  await shoot(page, 'arabe-public-rendez-vous-coordonnees-telephone');
  await page.setViewportSize(DESKTOP);
  await expectRtlPage(page);
  await shoot(page, 'arabe-public-rendez-vous-coordonnees-bureau');
  expect(sends()).toBe(0);
});

test.describe('arabe non proposé (Q80)', () => {
  for (const locale of ['fr', 'en', 'ar'] as const) {
    test(`/${locale}/ : aucun hreflang="ar"${locale === 'ar' ? '' : ', aucun lien vers /ar/'}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/comment-ca-marche`);
      await expect(page.locator('main h1')).toBeVisible();
      // Les alternatives hreflang existent (fr, en), jamais l'arabe.
      await expect(page.locator('link[rel="alternate"]').first()).toBeAttached();
      await expect(page.locator('[hreflang="ar"]')).toHaveCount(0);
      if (locale !== 'ar') {
        // Ni sélecteur de langue ni lien vers le bundle arabe (en /ar/, les liens internes y mènent).
        const toArabic = await page.evaluate(
          () =>
            [...document.querySelectorAll('a[href]')].filter((a) =>
              new URL((a as HTMLAnchorElement).href).pathname.startsWith('/ar/'),
            ).length,
        );
        expect(toArabic).toBe(0);
      }
    });
  }
});

test.describe('messages au pluriel ICU : texte inchangé en français et en anglais', () => {
  // Textes d'avant M16-11 (cibles d'origine), comparés sans normalisation des espaces.
  const EXPECTED = {
    fr: {
      sub: " La vérification prend au plus 2 jours ouvrés. Elle ne bloque pas l'usage de l'outil de suivi. ",
      contact:
        "Le message part chez le praticien ; il n'est rattaché à aucun dossier et il est effacé après 30 jours.",
    },
    en: {
      sub: 'Verification takes at most 2 business days. It does not block the use of the follow-up tool.',
      contact:
        'The message goes to the practitioner; it is never attached to a file and is deleted after 30 days.',
    },
  } as const;
  for (const locale of ['fr', 'en'] as const) {
    test(`/${locale}/comment-ca-marche`, async ({ page }) => {
      await page.goto(`/${locale}/comment-ca-marche`);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.locator('.sub').evaluate((el) => el.textContent)).toBe(
        EXPECTED[locale].sub,
      );
      expect(
        await page
          .locator('.never li > span')
          .nth(1)
          .evaluate((el) => el.textContent),
      ).toBe(EXPECTED[locale].contact);
    });
  }
});
