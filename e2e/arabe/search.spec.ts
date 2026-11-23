import {
  APIRequestContext,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { post, waitIntake } from '../flux-5-recherche/dossier-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-21, recherche dans le dossier en /ar/ (G Q71, Q74 à Q77 ; docs/design/arabe.md §2 à §5 ;
// fiche 07) : résultats, aucun résultat et aperçu ouvert, page de droite à gauche, aperçu du côté de
// la fin de ligne (à gauche), contenu saisi dans son sens (dir="auto"), surlignage d'un mot arabe
// sans marge intérieure (liaison des lettres), sans défilement horizontal, axe-core sans violation,
// une capture par écran (PSYMATE_E2E_CAPTURES). Aucun libellé ciblé (rôles, structure, URL) : les
// textes de /ar/ passent du français de repli à l'arabe au fil du jalon. Contre l'API locale (seed
// small, Mailpit), jamais de mock du backend : compte jetable, patient et entrées créés par le test.
//
// Mot arabe : la recherche est faite par le serveur (plein texte « en français », contrat), qui ne
// promet rien pour un mot arabe (normalisation, racines). Le test cherche le mot exact, isolé par des
// espaces, d'une note qu'il a créée ; il lit d'abord la réponse de l'API et n'affirme dans l'écran
// que ce que le contrat garantit (un <mark> autour d'un mot trouvé). Si le serveur ne trouve pas le
// mot, la vérification du surlignage est sautée avec une raison explicite, sans échec d'interface.

/** « قلق » (anxiété) : mot cherché, entouré d'espaces dans le texte de la note. */
const ARABIC_WORD = 'قلق';
const LATIN_WORD = 'entretien';
/**
 * Texte arabe (première lettre forte arabe : de droite à gauche) qui cite aussi le mot latin cherché :
 * la recherche latine, que le plein texte français trouve, ramène la note arabe à côté de l'événement.
 */
const ARABIC_BODY = `نوبة ${ARABIC_WORD} شديدة قبل ${LATIN_WORD} مع المدير.`;
const ARABIC_TITLE = 'ملاحظة بعد الجلسة';
/** Aucune entrée ne contient ce mot, même à une faute près (trigrammes). */
const NO_MATCH = 'qzxjvkw';
const VIEWPORT = { width: 1440, height: 900 };

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

/** La recherche a répondu, la liste n'est plus grisée et l'aperçu n'est plus en chargement. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.results[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('pm-search-preview [aria-busy="true"]')).toHaveCount(0, {
    timeout: 20_000,
  });
}

function direction(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).direction);
}

test.describe('recherche dans le dossier en /ar/', () => {
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let patientId: string;
  let arabicId: string;
  let latinId: string;

  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    api = await playwrightRequest.newContext();
    const account = await createAccount(api, 'm16-21.recherche', 'psychologist');
    ({ id: patientId } = await post<{ id: string }>(api, '/api/patients', {
      displayName: 'سلمى ب.',
    }));
    await waitIntake(api, patientId);
    // CreateEntryRequest : note = body ; event = title. Séance courante par défaut (séance d'accueil).
    ({ id: arabicId } = await post<{ id: string }>(api, `/api/patients/${patientId}/entries`, {
      type: 'note',
      title: ARABIC_TITLE,
      body: ARABIC_BODY,
      occurred: { from: '2026-10-18T00:00:00Z', precision: 'day' },
    }));
    ({ id: latinId } = await post<{ id: string }>(api, `/api/patients/${patientId}/entries`, {
      type: 'event',
      title: "Entretien d'évaluation avec le manager",
      body: "Trois phrases préparées pour l'entretien.",
      occurred: { from: '2026-10-17T00:00:00Z', precision: 'day' },
    }));
    // Contexte créé explicitement : axe-core refuse une page ouverte par browser.newPage().
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      locale: testInfo.project.use.locale,
      timezoneId: testInfo.project.use.timezoneId,
      viewport: VIEWPORT,
    });
    page = await context.newPage();
    // Connexion en /fr/ (libellés connus), puis /ar/ : la session garde le bundle de l'URL.
    await signIn(page, account);
  });

  test.afterAll(async () => {
    await context?.close();
    await api?.dispose();
  });

  /** L'écran de recherche en /ar/ sur ?q=, une fois la réponse de l'API reçue. */
  async function openSearch(q: string): Promise<void> {
    const searched = page.waitForResponse(
      (r) => r.url().includes(`/api/patients/${patientId}/search`) && r.ok(),
    );
    await page.goto(`/ar/patients/${patientId}/search?q=${encodeURIComponent(q)}`);
    await searched;
    await expect(page.locator('section.search')).toBeVisible();
    await settled(page);
  }

  test('résultats et aperçu ouvert : aperçu à gauche, contenu saisi dans son sens', async () => {
    await openSearch(LATIN_WORD);
    const item = page.locator(`pm-search-results li[data-entry-id="${latinId}"]`);
    await expect(item).toBeVisible();
    await expect(item.locator('mark').first()).toBeVisible();
    // Aperçu ouvert sur l'événement latin (clic sur son titre).
    await item.locator('button.title').click();
    await expect(item).toHaveAttribute('aria-current', 'true');
    const preview = page.locator('pm-search-preview aside');
    await expect(preview.locator('h3')).toBeVisible();
    await settled(page);
    // Aperçu du côté de la fin de ligne : à gauche de la liste (rangée flex de droite à gauche).
    const list = (await page.locator('.results').boundingBox())!;
    const aside = (await preview.boundingBox())!;
    expect(aside.x + aside.width).toBeLessThanOrEqual(list.x + 1);
    // Titre, extrait et texte d'un contenu latin : de gauche à droite dans la page arabe (Q77).
    await expect(item.locator('button.title')).toHaveAttribute('dir', 'auto');
    await expect(item.locator('.snippet')).toHaveAttribute('dir', 'auto');
    expect(await direction(page, `li[data-entry-id="${latinId}"] .snippet`)).toBe('ltr');
    await expect(preview.locator('h3')).toHaveAttribute('dir', 'auto');
    await expect(preview.locator('p.body')).toHaveAttribute('dir', 'auto');
    expect(await direction(page, 'pm-search-preview p.body')).toBe('ltr');
    // Nom du patient saisi en arabe, isolé dans la phrase de portée.
    await expect(page.locator('.scope bdi')).toHaveText('سلمى ب.');
    // Chiffres latins (Q71 point 2) dans les dates des résultats et de l'aperçu.
    expect(await item.locator('.meta').textContent()).not.toMatch(/[٠-٩۰-۹]/);
    expect(await preview.locator('dl').textContent()).not.toMatch(/[٠-٩۰-۹]/);
    await expectRtlPage(page);
    await shoot(page, 'arabe-recherche-resultats');

    // La note arabe, trouvée par le mot latin qu'elle cite : titre et extrait de droite à gauche,
    // puis son aperçu, ouvert par un clic sur son titre.
    const arabic = page.locator(`pm-search-results li[data-entry-id="${arabicId}"]`);
    await expect(arabic).toBeVisible();
    expect(await direction(page, `li[data-entry-id="${arabicId}"] button.title`)).toBe('rtl');
    expect(await direction(page, `li[data-entry-id="${arabicId}"] .snippet`)).toBe('rtl');
    await arabic.locator('button.title').click();
    await expect(arabic).toHaveAttribute('aria-current', 'true');
    await expect(preview.locator('h3')).toHaveText(ARABIC_TITLE);
    await settled(page);
    expect(await direction(page, 'pm-search-preview h3')).toBe('rtl');
    expect(await direction(page, 'pm-search-preview p.body')).toBe('rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-recherche-apercu');
  });

  test('aucun résultat : état vide et aide de la syntaxe', async () => {
    await openSearch(NO_MATCH);
    await expect(page.locator('pm-search-results')).toHaveCount(0);
    await expect(page.locator('.results pm-state')).toBeVisible();
    await expect(page.locator('.results pm-search-syntax-help')).toBeVisible();
    await expectRtlPage(page);
    await shoot(page, 'arabe-recherche-vide');
  });

  test('mot arabe : extrait surligné, de droite à gauche, <mark> sans marge intérieure', async () => {
    // Ce que le serveur trouve pour ce mot, lu d'abord par l'API (GET /api/patients/{id}/search).
    const response = await api.get(`${API}/api/patients/${patientId}/search`, {
      params: { q: ARABIC_WORD },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      items?: { entryId?: string; snippet?: string | null; title?: string | null }[];
    };
    const found = (body.items ?? []).find((item) => item.entryId === arabicId);
    const marked = [found?.snippet, found?.title].some((fragment) =>
      (fragment ?? '').includes('<mark>'),
    );
    // Titre et corps indexés de façon synchrone, websearch_to_tsquery('french', f_unaccent(..))
    // laisse le mot arabe intact : un échec ici est un écart de l'API, à remonter.
    expect(
      found,
      `écart d'API : le serveur ne trouve pas la note pour le mot arabe exact « ${ARABIC_WORD} »`,
    ).toBeTruthy();
    expect(
      marked,
      `écart d'API : le serveur trouve la note pour « ${ARABIC_WORD} » mais n'y pose aucun <mark>`,
    ).toBe(true);

    await openSearch(ARABIC_WORD);
    const item = page.locator(`pm-search-results li[data-entry-id="${arabicId}"]`);
    await expect(item).toBeVisible();
    const mark = item.locator('mark').first();
    await expect(mark).toBeVisible();
    expect(await mark.textContent()).toMatch(/[؀-ۿ]/);
    // Liaison des lettres : un <mark> arabe n'a ni marge intérieure, ni bordure, ni marge
    // horizontales, et reste en ligne (docs/design/arabe.md §4).
    const style = await mark.evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        display: css.display,
        padding: [css.paddingInlineStart, css.paddingInlineEnd],
        margin: [css.marginInlineStart, css.marginInlineEnd],
        border: [css.borderInlineStartWidth, css.borderInlineEndWidth],
      };
    });
    expect(style).toEqual({
      display: 'inline',
      padding: ['0px', '0px'],
      margin: ['0px', '0px'],
      border: ['0px', '0px'],
    });
    // Le texte saisi en arabe se lit de droite à gauche (dir="auto").
    if (found?.snippet?.includes('<mark>')) {
      expect(await direction(page, `li[data-entry-id="${arabicId}"] .snippet`)).toBe('rtl');
    }
    await expectRtlPage(page);
    await shoot(page, 'arabe-recherche-mot-arabe');
  });
});
