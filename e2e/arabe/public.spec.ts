import { expect, Locator, Page, test } from '@playwright/test';

import { MANUAL } from '../prise-de-rendez-vous/page-publique-support';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-11, pages publiques de droite à gauche (G Q71, Q73 à Q77, Q80 ; docs/design/arabe.md §2 à §5,
// §7, §9) : annuaire (résultats, filtres ouverts, aucun résultat), fiche d'un praticien, formulaire
// de contact, prise de rendez-vous (créneaux, coordonnées), « comment ça marche » et pages
// d'information en /ar/, en largeur de bureau et de téléphone ; dir="rtl", pas de défilement
// horizontal, axe-core sans violation, une capture par écran (PSYMATE_E2E_CAPTURES). Le rendu est
// mesuré (boîtes, ordre des caractères à l'écran), pas seulement les attributs. Aucun libellé ciblé
// (rôles, structure, URL) : les textes de /ar/ passent du français de repli à l'arabe au fil du
// jalon. Contre l'API locale (seed small), jamais de mock du backend.
//
// Budget de l'API publique (60 requêtes par minute sur /api/public/**, 5 demandes de rendez-vous
// par heure et par IP en CI) : aucune demande de rendez-vous ni aucun message de contact n'est
// envoyé ici (formulaires vides ou arrêtés avant l'envoi), et les fichiers se jouent en série.

const WIDTHS = [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'telephone', width: 390, height: 844 },
] as const;

/** Envois interdits ici : demande de rendez-vous, message de contact. */
const SENDS =
  /\/api\/public\/(booking\/practitioners\/[^/]+\/requests|directory\/practitioners\/[^/]+\/contact)$/;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

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

/** Compte les envois (POST) partis de la page : aucun ne doit partir. */
function countSends(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && SENDS.test(new URL(request.url()).pathname)) count++;
  });
  return () => count;
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

for (const size of WIDTHS) {
  test.describe(`pages publiques en /ar/, ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const desktop = size.name === 'bureau';

    test('comment ça marche : filets et puces du côté du début (à droite)', async ({ page }) => {
      await page.goto('/ar/comment-ca-marche');
      await expect(page.locator('main h1')).toBeVisible();
      await expectRtlPage(page);
      // Garanties : le filet de début de ligne est rendu à droite du texte.
      const item = page.locator('.never li').first();
      const border = await item.evaluate((el) => {
        const style = getComputedStyle(el);
        return { right: style.borderRightWidth, left: style.borderLeftWidth };
      });
      expect(border).toEqual({ right: '3px', left: '0px' });
      // Listes des deux parcours : retrait du côté droit.
      const list = page.locator('.path ul').first();
      const padding = await list.evaluate((el) => getComputedStyle(el).paddingRight);
      expect(padding).toBe('20px');
      // Surtitre : pas de capitales forcées en arabe (le nom du produit n'est pas déformé).
      const eyebrow = page.locator('.eyebrow');
      expect(await eyebrow.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
      expect(await eyebrow.innerText()).not.toContain('PSYMATE');
      if (desktop) {
        // Deux parcours côte à côte : le premier à droite du second.
        await expectRightOf(page.locator('.path').first(), page.locator('.path').nth(1));
      }
      await shoot(page, `arabe-public-comment-ca-marche-${size.name}`);
    });

    for (const [route, name] of [
      ['mentions-legales', 'mentions-legales'],
      ['confidentialite', 'confidentialite'],
      ['accessibilite', 'accessibilite'],
    ] as const) {
      test(`page d’information : ${name}`, async ({ page }) => {
        await page.goto(`/ar/${route}`);
        await expect(page.locator('main h1')).toBeVisible();
        await expectRtlPage(page);
        const pending = page.locator('.pending');
        if (await pending.count()) {
          const border = await pending.evaluate((el) => getComputedStyle(el).borderRightWidth);
          expect(border).toBe('4px');
        }
        await shoot(page, `arabe-public-${name}-${size.name}`);
      });
    }

    test('annuaire : résultats, fiches résumées retournées', async ({ page }) => {
      await page.goto('/ar/annuaire');
      const card = page.locator('pm-practitioner-card').first();
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expectRtlPage(page);
      // Avatar en début de ligne (à droite du corps de la fiche).
      await expectRightOf(card.locator('pm-practitioner-avatar'), card.locator('.identity'));
      if (desktop) {
        // Filtres à droite des résultats ; boutons de la fiche à gauche du corps.
        await expectRightOf(page.locator('aside.filters'), page.locator('section.results'));
        await expectRightOf(card.locator('.body'), card.locator('.actions'));
      }
      // Ligne de méta : le premier point de séparation de chaque ligne est rogné (côté droit).
      const meta = card.locator('.meta');
      const clip = await meta.evaluate((el) => {
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
      await shoot(page, `arabe-public-annuaire-${size.name}`);
    });

    test('annuaire : filtres ouverts', async ({ page }) => {
      test.skip(desktop, 'panneau de filtres plein écran sous 760 px seulement');
      await page.goto('/ar/annuaire');
      await expect(page.locator('pm-practitioner-card').first()).toBeVisible({ timeout: 20_000 });
      await page.locator('.filters-toggle').click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expectRtlPage(page);
      // Croix de fermeture en fin de ligne (à gauche) du titre du panneau.
      const close = page.locator('.panel-close');
      const panel = await dialog.boundingBox();
      const closeBox = await close.boundingBox();
      expect(closeBox!.x).toBeLessThan(panel!.x + panel!.width / 2);
      await shoot(page, `arabe-public-annuaire-filtres-${size.name}`);
    });

    test('annuaire : aucun résultat', async ({ page }) => {
      await page.goto('/ar/annuaire?ville=zzqx-nulle-part');
      await expect(page.locator('.no-results')).toBeVisible({ timeout: 20_000 });
      await expectRtlPage(page);
      await shoot(page, `arabe-public-annuaire-vide-${size.name}`);
    });

    test('fiche d’un praticien : coordonnées en dir="ltr", rendues de gauche à droite', async ({
      page,
    }) => {
      await page.goto(`/ar/praticiens/${MANUAL}`);
      await expect(page.locator('#practitioner-name')).toBeVisible({ timeout: 20_000 });
      await expectRtlPage(page);
      if (desktop) {
        // Avatar en début de ligne : à droite de l'identité (au-dessus sur téléphone).
        await expectRightOf(
          page.locator('.identity pm-practitioner-avatar'),
          page.locator('.identity-body'),
        );
        // Colonne latérale (coordonnées, cabinet) à gauche de la colonne principale.
        await expectRightOf(page.locator('.main'), page.locator('aside.side'));
      }
      // Téléphone, e-mail, site : premier caractère à gauche du dernier (pas de chiffres retournés).
      for (const link of await page.locator('.means a').all()) {
        const { first, last } = await firstAndLastX(link);
        expect(first).toBeLessThan(last);
      }
      await shoot(page, `arabe-public-fiche-${size.name}`);
    });

    test('formulaire de contact : champs vides signalés, aucun envoi', async ({ page }) => {
      const sends = countSends(page);
      await page.goto(`/ar/praticiens/${MANUAL}`);
      const form = page.locator('pm-contact-form form');
      await expect(form).toBeVisible({ timeout: 20_000 });
      // Compteur « 0 / 4000 » (avant les erreurs, qui prennent la place des aides) : se lit de
      // gauche à droite.
      const { first, last } = await firstAndLastX(form.locator('.length span'));
      expect(first).toBeLessThan(last);
      // Nom : dir="auto", rendu de droite à gauche pour une saisie arabe, de gauche à droite sinon.
      const name = form.locator('#field-name');
      await name.fill('سلمى بن علي');
      expect(await name.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      await name.fill('Claire');
      expect(await name.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      await name.fill('');
      await form.locator('button[type="submit"]').click();
      await expect(form.locator('mat-error').first()).toBeVisible();
      await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
      await expectRtlPage(page);
      if (desktop) {
        // Nom (premier champ) à droite de l'e-mail.
        await expectRightOf(form.locator('.field').first(), form.locator('.field').nth(1));
      }
      await shoot(page, `arabe-public-contact-${size.name}`);
      expect(sends()).toBe(0);
    });

    test('prise de rendez-vous : créneaux, chevrons retournés, coordonnées ; aucune demande', async ({
      page,
    }) => {
      const sends = countSends(page);
      await page.goto(`/ar/praticiens/${MANUAL}/rendez-vous`);
      const slot = page.locator('button.slot').first();
      await expect(slot).toBeVisible({ timeout: 20_000 });
      await expectRtlPage(page);
      // Heure du créneau : chiffres latins sur 24 h (Q71, Q73).
      await expect(slot).toHaveText(/^\s*\d{2}:\d{2}\s*$/);
      // Chevrons des fenêtres : retournés en RTL (« suivant » pointe vers la gauche).
      const chevrons = page.locator('.period-nav svg');
      for (const svg of await chevrons.all()) {
        expect(await svg.evaluate((el) => getComputedStyle(el).transform)).toBe(
          'matrix(-1, 0, 0, 1, 0, 0)',
        );
      }
      await shoot(page, `arabe-public-rendez-vous-creneaux-${size.name}`);

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
      // E-mail et téléphone en dir="ltr", prénom et nom en dir="auto".
      expect(
        await form.locator('#field-email').evaluate((el) => getComputedStyle(el).direction),
      ).toBe('ltr');
      await expect(form.locator('#field-firstName')).toHaveAttribute('dir', 'auto');
      await shoot(page, `arabe-public-rendez-vous-coordonnees-${size.name}`);
      expect(sends()).toBe(0);
    });
  });
}

test('/ar/ : aucun lien hreflang ni sélecteur vers l’arabe (Q80)', async ({ page }) => {
  await page.goto('/ar/comment-ca-marche');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('link[rel="alternate"]').first()).toBeAttached();
  await expect(page.locator('link[hreflang="ar"], a[hreflang="ar"]')).toHaveCount(0);
});
