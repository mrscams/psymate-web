import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { exclusive } from '../support/exclusif';
import {
  block,
  emptyPatient,
  isOverview,
  overviewFolder,
  overviewWindow,
  serverMs,
  setPreferences,
  viewToggle,
  windowSelector,
} from './overview-data';

// Vue d'ensemble complète (M4-05, fiche 02, B3 flux 6, B4 écran 2, B8), contre l'API locale (seed
// small, Mailpit), jamais de mock du backend. Chaque test crée son compte jetable et ses dossiers
// par l'API ; axe-core (WCAG 2.0/2.1 A et AA) dans chaque test.

const API = 'http://localhost:8080';

test.describe('vue d’ensemble', () => {
  test.describe.configure({ timeout: 120_000 });

  test('ouvrir un patient : synthèse en moins de 200 ms côté API (à chaud), situation → graphe centré', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.ouvrir', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);

    // Ouverture du patient (défaut du compte : vue simple, 90 jours). Mesure à froid : durée de la
    // réponse GET …/overview relue par le navigateur (de l'envoi au premier octet), consignée
    // seulement (premier calcul de la projection) ; le seuil porte sur la médiane à chaud.
    // Seulement une lecture partie après la navigation : la liste des patients, où arrive la
    // connexion, lit aussi GET …/overview?window=30d pour chaque ligne (résumé d'activité), et
    // cette réponse peut arriver après l'inscription de l'attente.
    const navigatedAt = Date.now();
    const opened = page.waitForResponse(
      (r) => isOverview(r, folder.patientId) && r.request().timing().startTime >= navigatedAt,
    );
    await page.goto(`/fr/patients/${folder.patientId}`);
    const first = await opened;
    expect(first.status()).toBe(200);
    expect(overviewWindow(first)).toBe('90d');
    const openMs = serverMs(first);
    test.info().annotations.push({ type: 'overview-open-ms', description: openMs.toFixed(1) });
    console.log(`[M4-05] GET /overview à l'ouverture (à froid) : ${openMs.toFixed(1)} ms`);
    // timing() vaut -1 quand la mesure manque : elle doit exister.
    expect(openMs).toBeGreaterThan(0);

    // Vue simple « Récit » (défaut, M4-07) ; la bascule est à droite des onglets.
    await expect(block(page, 'En bref')).toBeVisible();
    const toggle = viewToggle(page);
    await expect(toggle).toContainText('mémorisée dans vos préférences');
    await expect(toggle.getByRole('button', { name: 'Simple' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoAxeViolations(page);

    // Bascule « Complète » : écrit overview.view tout de suite ; les blocs de la vue complète.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await toggle.getByRole('button', { name: 'Complète' }).click();
    expect((await saved).request().postDataJSON()).toEqual({ 'overview.view': 'complete' });
    await expect(toggle.getByRole('button', { name: 'Complète' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const facts = block(page, 'Faits clés');
    // Tuile « Ressentis » : les trois ressentis de la fenêtre ; intensité moyenne de la fenêtre.
    await expect(facts.locator('.figure').nth(1)).toHaveText('3');
    await expect(facts.locator('.figure').nth(2)).toHaveText('6,0/10');
    const trend = block(page, "Tendance d'intensité · 90 jours");
    await expect(trend.getByRole('img')).toHaveAttribute(
      'aria-label',
      /Ressentis sur la période : 3/,
    );
    // ECharts (chargé à la demande) dessine la courbe.
    await expect(trend.locator('pm-overview-trend-chart svg').first()).toBeVisible();
    // Traitement dans les faits clés ; suivi depuis la première séance connue (dossier créé
    // aujourd'hui, séance passée il y a 10 jours).
    await expect(facts).toContainText('Sertraline 50 mg');
    await expect(facts).toContainText('(première séance connue)');
    await expect(block(page, /Émotions dominantes/)).toContainText('Anxiété');
    const situations = block(page, 'Situations actives');
    await expect(situations).toContainText('Surcharge au travail');
    await expect(situations).toContainText('2 ressentis liés · intensité moy. 7,0/10');
    await expect(page.locator('footer')).toContainText('Dernière mise à jour de la synthèse');
    await expectNoAxeViolations(page);

    // Dernières séances : la plus récente est dépliée, et mène à la timeline par séance.
    const sessions = block(page, 'Dernières séances');
    await expect(sessions.locator('button[aria-expanded="true"]')).toHaveCount(1);
    await expect(
      sessions.getByRole('link', { name: 'Voir la séance dans la timeline' }),
    ).toHaveAttribute('href', new RegExp(`/timeline\\?mode=session&focus=`));

    // Clic sur la situation → graphe centré sur elle.
    await situations.getByRole('link', { name: /voir dans le graphe/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );
    // « Centré sur » (UX-B3) : bouton de la liste filtrable, qui montre le titre de la racine.
    const rootPicker = page.getByRole('button', {
      name: 'Centré sur Surcharge au travail',
      exact: true,
    });
    await expect(rootPicker).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(rootPicker.locator('.value')).toHaveText('Surcharge au travail');

    // Mesure à chaud (dossier relu, cache de la projection) : 5 lectures directes de l'API.
    // Sous le verrou « charge-api » : la mesure ne tombe pas pendant une charge d'un autre test.
    const timings: number[] = [];
    await exclusive('charge-api', async () => {
      for (let i = 0; i < 5; i++) {
        const started = performance.now();
        const response = await request.get(
          `${API}/api/patients/${folder.patientId}/overview?window=90d`,
        );
        timings.push(performance.now() - started);
        expect(response.status()).toBe(200);
      }
    });
    const median = [...timings].sort((a, b) => a - b)[2];
    test
      .info()
      .annotations.push({ type: 'overview-warm-median-ms', description: median.toFixed(1) });
    console.log(`[M4-05] GET /overview à chaud, médiane de 5 : ${median.toFixed(1)} ms`);
    expect(median).toBeLessThan(200);
  });

  test('bascule et fenêtre conservées après reconnexion (préférences du compte)', async ({
    page,
    request,
    browser,
  }) => {
    const account = await createAccount(request, 'm4-05.prefs', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    const viewSaved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await viewToggle(page).getByRole('button', { name: 'Complète' }).click();
    expect((await viewSaved).request().postDataJSON()).toEqual({ 'overview.view': 'complete' });
    await expect(block(page, 'Faits clés')).toBeVisible();

    // 1 an : écrit overview.window, la synthèse est relue par l'API avec ?window=12m.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await windowSelector(page).getByRole('button', { name: '1 an' }).click();
    expect((await saved).request().postDataJSON()).toEqual({ 'overview.window': '12m' });
    expect(overviewWindow(await reread)).toBe('12m');
    await expect(block(page, "Tendance d'intensité · 12 mois")).toBeVisible();
    await expectNoAxeViolations(page);

    // Autre navigateur (ni cookie ni cache local) : reconnexion, la vue et la fenêtre sont là.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, account);
    // Même filtre qu'au premier test : pas la lecture 30d de la ligne de la liste des patients.
    const navigatedAt = Date.now();
    const opened = otherPage.waitForResponse(
      (r) => isOverview(r, folder.patientId) && r.request().timing().startTime >= navigatedAt,
    );
    await otherPage.goto(`/fr/patients/${folder.patientId}`);
    expect(overviewWindow(await opened)).toBe('12m');
    await expect(viewToggle(otherPage).getByRole('button', { name: 'Complète' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(windowSelector(otherPage).getByRole('button', { name: '1 an' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(block(otherPage, "Tendance d'intensité · 12 mois")).toBeVisible();
    await expectNoAxeViolations(otherPage);
    await other.close();
  });

  test('saisir un ressenti depuis l’onglet : la projection le reflète en moins de 2 s', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.saisie', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    // Tuile « Ressentis » et résumé de la courbe : des valeurs de la projection (recentActivity,
    // lu en direct, ne prouverait rien).
    const feelings = block(page, 'Faits clés').locator('.figure').nth(1);
    await expect(feelings).toHaveText('3');
    const trend = block(page, "Tendance d'intensité · 90 jours");

    // Sans séance ouverte, pas de bloc de saisie (UX-S1) : N ouvre l'éditeur d'entrée → Ressenti,
    // anxiété 7, texte → Enregistrer.
    await expect(page.getByRole('textbox', { name: 'Noter quelque chose' })).toHaveCount(0);
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog').filter({ has: page.locator('pm-entry-editor-panel') });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Ressenti', exact: true }).click();
    await dialog.getByLabel('Texte', { exact: true }).fill('Tendue avant la réunion');
    const emotion = dialog.getByRole('combobox', { name: 'Émotion' });
    await emotion.fill('anx');
    await emotion.press('ArrowDown');
    await emotion.press('Enter');
    await expect(emotion).toHaveValue('Anxiété');
    await dialog.getByRole('slider').focus();
    await page.keyboard.press('7');
    await expect(dialog.getByRole('slider')).toHaveAttribute('aria-valuenow', '7');
    // Fenêtre mesurée sous le verrou « charge-api » : jamais pendant qu'un autre test écrit des
    // centaines d'entrées (pool de connexions et file asynchrone de l'API saturés, M7-04).
    await exclusive('charge-api', async () => {
      // La relecture attendue est celle lancée après la réponse du POST (horloge du navigateur :
      // début de la requête + arrivée de la réponse), pas une lecture antérieure encore en vol.
      let postedAt = Number.POSITIVE_INFINITY;
      const created = page.waitForResponse((r) => {
        if (
          r.request().method() !== 'POST' ||
          !r.url().endsWith(`/api/patients/${folder.patientId}/entries`)
        ) {
          return false;
        }
        const timing = r.request().timing();
        postedAt = timing.startTime + timing.responseStart;
        return true;
      });
      const reread = page.waitForResponse(
        (r) => isOverview(r, folder.patientId) && r.request().timing().startTime >= postedAt,
      );
      await dialog.getByRole('button', { name: /^Enregistrer/ }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toMatchObject({
        type: 'feeling',
        feeling: { emotionCode: 'anxiety', intensity: 7 },
      });
      const saved = Date.now();

      // Nouvelle lecture de la projection après l'écriture (jamais de recalcul local).
      const after = await reread;
      expect(after.status()).toBe(200);
      expect(after.request().timing().startTime).toBeGreaterThan(
        response.request().timing().startTime,
      );
      await expect(feelings).toHaveText('4', { timeout: 2_000 });
      await expect(trend.getByRole('img')).toHaveAttribute(
        'aria-label',
        /Ressentis sur la période : 4/,
        { timeout: 2_000 },
      );
      const reflected = Date.now() - saved;
      test.info().annotations.push({ type: 'overview-reflect-ms', description: String(reflected) });
      console.log(`[M4-05] ressenti reflété par la vue d'ensemble en ${reflected} ms`);
      expect(reflected).toBeLessThan(2_000);
    });
    await expect(dialog).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('au clavier : fenêtre, bascule Vue, séance, « Voir les données », « Voir dans le graphe »', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.clavier', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(block(page, 'Faits clés').locator('.figure').nth(1)).toHaveText('3');

    // Sélecteur de fenêtre : Tab d'un bouton à l'autre, Entrée et Espace le pressent.
    const windows = windowSelector(page);
    await windows.getByRole('button', { name: '90 j' }).focus();
    await page.keyboard.press('Tab');
    await expect(windows.getByRole('button', { name: '1 an' })).toBeFocused();
    let reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await page.keyboard.press('Enter');
    expect(overviewWindow(await reread)).toBe('12m');
    await expect(windows.getByRole('button', { name: '1 an' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Shift+Tab');
    await expect(windows.getByRole('button', { name: '90 j' })).toBeFocused();
    reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await page.keyboard.press('Space');
    expect(overviewWindow(await reread)).toBe('90d');
    await expect(block(page, "Tendance d'intensité · 90 jours")).toBeVisible();

    // Bascule Vue : Espace → Simple (vue « Récit »), Tab puis Entrée → Complète.
    const toggle = viewToggle(page);
    await toggle.getByRole('button', { name: 'Simple' }).focus();
    await page.keyboard.press('Space');
    await expect(block(page, 'En bref')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(toggle.getByRole('button', { name: 'Complète' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(block(page, 'Dernières séances')).toBeVisible();

    // Séance : Entrée la déplie, Espace la replie.
    const sessions = block(page, 'Dernières séances');
    const second = sessions.locator('button[aria-expanded]').nth(1);
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(second).toHaveAttribute('aria-expanded', 'false');

    // « Voir les données » : Entrée ouvre le tableau des ressentis (en-tête + 3 lignes).
    const trend = block(page, "Tendance d'intensité · 90 jours");
    await trend.getByText('Voir les données').focus();
    await page.keyboard.press('Enter');
    await expect(trend.getByRole('table')).toBeVisible();
    await expect(trend.getByRole('row')).toHaveCount(4);
    await expectNoAxeViolations(page);

    // « Voir dans le graphe » : Entrée → graphe centré sur la situation.
    await block(page, 'Situations actives')
      .getByRole('link', { name: /voir dans le graphe/i })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );
  });

  test('« Démarrer la séance » depuis l’onglet 1 : séance précédente repliée, focus dans la barre de capture', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.demarrer', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    const sessions = block(page, 'Dernières séances');
    const toggles = sessions.locator('button[aria-expanded]');
    await expect(toggles).toHaveCount(2);
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true');

    // Dépliage au clic : la séance passée montre son lien vers la timeline par séance.
    await toggles.nth(1).click();
    await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(
      sessions.getByRole('link', { name: 'Voir la séance dans la timeline' }),
    ).toHaveCount(2);

    // Démarrer (B3 flux 6, étape 4) : la synthèse est relue, les séances précédentes se replient,
    // la barre de capture prend le focus.
    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await page.getByRole('button', { name: 'Démarrer la séance' }).click();
    await expect(page.getByRole('textbox', { name: 'Noter quelque chose' })).toBeFocused();
    expect((await reread).status()).toBe(200);
    await expect(toggles).toHaveCount(3);
    await expect(sessions.locator('button[aria-expanded="true"]')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('patient sans données : chaque bloc garde son titre et son état vide', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.vide', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const patientId = await emptyPatient(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);

    const empties: [string | RegExp, string][] = [
      [/Tendance d'intensité/, 'Pas encore de ressentis sur cette période'],
      ['Situations actives', 'Aucune situation en cours'],
      ['Dernières séances', 'Aucune séance'],
      [/Émotions dominantes/, "Pas d'émotion dominante"],
      ['À compléter', 'Rien à compléter'],
      ['Activité récente', 'Aucune entrée pour le moment'],
    ];
    for (const [heading, title] of empties) {
      const section = block(page, heading);
      await expect(section.getByRole('status')).toContainText(title);
    }
    // Les faits clés ne sont jamais « vides » : leurs zéros sont une information.
    const facts = block(page, 'Faits clés');
    await expect(facts.locator('.figure')).toHaveText(['0', '0', '—', '0']);
    await expect(facts).toContainText('Aucun traitement en cours');
    await expectNoAxeViolations(page);
  });

  test('mode sombre : tokens sombres appliqués à la vue complète, axe sans violation', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.sombre', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete', theme: 'dark' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const trend = block(page, "Tendance d'intensité · 90 jours");
    await expect(trend.locator('pm-overview-trend-chart svg').first()).toBeVisible();
    await expect(block(page, 'Situations actives')).toContainText('Surcharge au travail');
    await expectNoAxeViolations(page);
  });
});
