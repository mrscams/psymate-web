import { expect, test } from '@playwright/test';

import { daysAgo } from '../flux-5-timeline/timeline-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { exclusive } from '../support/exclusif';
import {
  block,
  emptyPatient,
  isOverview,
  notedSince,
  overviewFolder,
  overviewWindow,
  readOverview,
  risingFolder,
  serverMs,
  setPreferences,
  since,
  sinceFacts,
  windowSelector,
} from './overview-data';

// Vue d'ensemble unifiée (UX-S6, proposition propositions-2026-11/02-vue-ensemble ; fiche 02,
// B3 flux 6, B4 écran 2), contre l'API locale (seed small, Mailpit), jamais de mock du backend.
// Chaque test crée son compte jetable et ses dossiers par l'API ; axe-core (WCAG 2.0/2.1 A et AA)
// dans chaque test.

const API = 'http://localhost:8080';

/** « 4 novembre » : le jour d'une date dans le fuseau des tests, comme la bande « Depuis ». */
function longDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

test.describe('vue d’ensemble', () => {
  test.describe.configure({ timeout: 120_000 });

  test('ouvrir un patient : une seule vue dans l’ordre de lecture, synthèse en moins de 200 ms (à chaud), situation → graphe', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.ouvrir', 'psychologist');
    const folder = await overviewFolder(request);
    await notedSince(request, folder.patientId);
    await signIn(page, account);

    // Ouverture du patient (fenêtre par défaut : 90 jours). Mesure à froid consignée seulement ;
    // seulement une lecture partie après la navigation (la liste lit aussi …/overview?window=30d).
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
    expect(openMs).toBeGreaterThan(0);

    // Une seule vue : ni bascule Simple / Complète, ni bloc de saisie hors séance (décision 1) ;
    // le sélecteur de fenêtre à droite des onglets.
    await expect(page.getByRole('button', { name: 'Simple', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Complète', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Noter quelque chose' })).toHaveCount(0);
    await expect(windowSelector(page).getByRole('button', { name: '90 j' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Bande « Depuis la séance du … » : phrases du serveur, trois chiffres (ressentis notés depuis,
    // moyenne 7 j du serveur, brouillons).
    await expect(since(page).getByRole('heading', { level: 3 })).toHaveText(
      `Depuis la séance du ${longDay(daysAgo(10, 14))}`,
    );
    const { narrative } = await readOverview(request, folder.patientId);
    await expect(since(page).locator('.brief')).toContainText(narrative.sentences[0]);
    await expect(sinceFacts(page).nth(0)).toHaveText('1');
    await expect(sinceFacts(page).nth(2)).toHaveText('1');

    // Ordre de lecture : ressentis, noté depuis, séances ; puis la colonne latérale.
    await expect(page.locator('.ov > .main pm-overview-section h3')).toHaveText([
      'Comment évoluent les ressentis',
      'Noté depuis la dernière séance',
      'Dernières séances',
    ]);
    await expect(page.locator('pm-overview-side pm-overview-section h3')).toHaveText([
      'Cadre du suivi',
      'Traitement en cours',
      'Situations en cours · 1',
      'Émotions · 90 jours',
      'À compléter',
    ]);

    // Graphe : compteur, ECharts dessiné, description accessible.
    const feelings = block(page, 'Comment évoluent les ressentis');
    await expect(feelings.locator('.count')).toHaveText(
      '90 jours · 4 ressentis · chaque point est une entrée',
    );
    await expect(feelings.locator('pm-overview-feelings-chart svg').first()).toBeVisible();
    await expect(feelings.getByRole('img')).toHaveAttribute(
      'aria-label',
      /moyenne glissante sur 7 jours/,
    );

    // Noté depuis la dernière séance : le ressenti nommé par son émotion et son échelle.
    const noted = block(page, 'Noté depuis la dernière séance');
    await expect(noted.locator('.count')).toHaveText('2 entrées · 1 brouillon');
    // Plus récente d'abord : la note d'hier, puis le ressenti d'avant-hier.
    const feeling = noted.locator('a.entry').nth(1);
    await expect(feeling.locator('.name')).toHaveText('Anxiété');
    await expect(feeling.locator('.scale i.on')).toHaveCount(7);
    await expect(feeling.locator('.chip')).toHaveText('brouillon');
    await expect(noted).not.toContainText('Ressenti');
    await expect(noted.locator('a.entry').first().locator('.name')).toHaveText(
      'Revoir l’hygiène de sommeil',
    );

    // Dernières séances, vers la timeline groupée par séance.
    const sessions = block(page, 'Dernières séances');
    await expect(sessions.locator('.count')).toHaveText(/^\d+ sur 90 jours · \d+ au total$/);
    await expect(sessions.getByRole('link', { name: 'Toutes les séances' })).toHaveAttribute(
      'href',
      /\/timeline\?mode=session$/,
    );
    // La séance d'accueil (aujourd'hui) porte sa nature ; la séance passée, modalité et durée.
    await expect(sessions.locator('.sess .t').first()).toContainText('· Accueil · cabinet');
    await expect(sessions.locator('.sess .t').nth(1)).toHaveText(
      /^[A-Z]\S+ \d+ \S+ · cabinet · 50 min\s*$/,
    );

    // Colonne latérale.
    await expect(block(page, 'Traitement en cours')).toContainText('Sertraline 50 mg');
    const situations = block(page, /^Situations en cours/);
    await expect(situations).toContainText('Surcharge au travail');
    await expect(situations).toContainText('2 ressentis liés');
    await expect(block(page, 'Émotions · 90 jours').locator('.emorow').first()).toContainText(
      'Anxiété',
    );
    await expect(block(page, 'À compléter')).toContainText('1 brouillon à relire');
    await expect(page.locator('pm-overview-side .foot')).toContainText(
      'Synthèse calculée par le serveur · mise à jour',
    );
    await expectNoAxeViolations(page);

    // Un clic sur une entrée l'ouvre (?entry=) ; la situation → graphe centré sur elle.
    await feeling.click();
    await expect(page).toHaveURL(/\?entry=/);
    await page.keyboard.press('Escape');
    await situations.getByRole('link', { name: /voir dans le graphe/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );

    // Mesure à chaud (cache de la projection) : 5 lectures directes, sous le verrou « charge-api ».
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
    expect(median).toBeLessThan(200);
  });

  test('fenêtre choisie dans l’en-tête : relue par l’API, conservée après reconnexion', async ({
    page,
    request,
    browser,
  }) => {
    const account = await createAccount(request, 'ux-s6.fenetre', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(block(page, 'Émotions · 90 jours')).toBeVisible();

    // 1 an : écrit overview.window (seule préférence de la vue), la synthèse est relue ?window=12m.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await windowSelector(page).getByRole('button', { name: '1 an' }).click();
    expect((await saved).request().postDataJSON()).toEqual({ 'overview.window': '12m' });
    expect(overviewWindow(await reread)).toBe('12m');
    await expect(block(page, 'Émotions · 12 mois')).toBeVisible();
    await expect(block(page, 'Comment évoluent les ressentis').locator('.count')).toContainText(
      '12 mois ·',
    );
    await expectNoAxeViolations(page);

    // Autre navigateur (ni cookie ni cache local) : la fenêtre est là.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, account);
    const navigatedAt = Date.now();
    const opened = otherPage.waitForResponse(
      (r) => isOverview(r, folder.patientId) && r.request().timing().startTime >= navigatedAt,
    );
    await otherPage.goto(`/fr/patients/${folder.patientId}`);
    expect(overviewWindow(await opened)).toBe('12m');
    await expect(windowSelector(otherPage).getByRole('button', { name: '1 an' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(block(otherPage, 'Émotions · 12 mois')).toBeVisible();
    await expectNoAxeViolations(otherPage);
    await other.close();
  });

  test('saisir un ressenti depuis l’onglet : la projection relue le reflète en moins de 2 s', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.saisie', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    // Le compteur du graphe : une valeur de la projection (feelings.points).
    const count = block(page, 'Comment évoluent les ressentis').locator('.count');
    await expect(count).toContainText('3 ressentis');

    // Sans séance ouverte, pas de bloc de saisie (UX-S1) : N ouvre l'éditeur → Ressenti.
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
    await exclusive('charge-api', async () => {
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
      const saved = Date.now();
      // Nouvelle lecture de la projection après l'écriture (jamais de recalcul local).
      expect((await reread).status()).toBe(200);
      await expect(count).toContainText('4 ressentis', { timeout: 2_000 });
      const reflected = Date.now() - saved;
      test.info().annotations.push({ type: 'overview-reflect-ms', description: String(reflected) });
      expect(reflected).toBeLessThan(2_000);
    });
    await expect(dialog).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('« Démarrer la séance » : l’onglet Séance s’ouvre, la vue d’ensemble relue compte la séance en cours', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.demarrer', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    const rows = block(page, 'Dernières séances').locator('.sess');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();

    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await page.getByRole('button', { name: 'Démarrer la séance' }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}/session$`));
    await expect(page.getByRole('textbox', { name: 'Noter quelque chose' })).toBeFocused();
    expect((await reread).status()).toBe(200);
    await page.getByRole('link', { name: /Vue d'ensemble/ }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}$`));
    // En séance, le bloc de saisie est posé par la page du shell au-dessus de l'onglet, une fois.
    await expect(page.locator('pm-capture-block')).toHaveCount(1);
    await expect(page.locator('pm-overview-page pm-capture-block')).toHaveCount(0);
    await expect(rows).toHaveCount(before + 1);
    await expect(block(page, 'À compléter')).toContainText('à clôturer');
    await expectNoAxeViolations(page);
  });

  test('l’intensité monte : la phrase de l’API s’affiche telle quelle dans la bande « Depuis »', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.monte', 'psychologist');
    const folder = await risingFolder(request);
    const { narrative } = await readOverview(request, folder.patientId);
    const rising = narrative.sentences.find((sentence) => / monte /.test(sentence));
    expect(rising, JSON.stringify(narrative)).toBeTruthy();
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(since(page).locator('.brief')).toContainText(rising!);
    // Faits en gras (dates, chiffres) sans changer le texte.
    await expect(since(page).locator('.brief b').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('patient sans données : « Depuis l’ouverture du dossier », chaque section garde son titre et son état vide', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.vide', 'psychologist');
    const patientId = await emptyPatient(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);

    await expect(since(page).getByRole('heading', { level: 3 })).toHaveText(
      "Depuis l'ouverture du dossier",
    );
    await expect(sinceFacts(page)).toHaveText(['0', '—', '0']);
    const empties: [string | RegExp, string][] = [
      ['Comment évoluent les ressentis', 'Pas encore de ressentis sur cette période'],
      ["Noté depuis l'ouverture du dossier", 'Rien de noté depuis'],
      ['Dernières séances', 'Aucune séance'],
      ['Traitement en cours', 'Aucun traitement en cours'],
      ['Situations en cours', 'Aucune situation en cours'],
      ['Émotions · 90 jours', 'Aucune émotion sur la période'],
      ['À compléter', 'Rien à compléter'],
    ];
    for (const [heading, title] of empties) {
      await expect(block(page, heading).getByRole('status')).toContainText(title);
    }
    await expectNoAxeViolations(page);
  });

  test('mode sombre : tokens sombres appliqués, graphe dessiné, axe sans violation', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s6.sombre', 'psychologist');
    await setPreferences(request, { theme: 'dark' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const feelings = block(page, 'Comment évoluent les ressentis');
    await expect(feelings.locator('pm-overview-feelings-chart svg').first()).toBeVisible();
    await expect(block(page, /^Situations en cours/)).toContainText('Surcharge au travail');
    await expectNoAxeViolations(page);
  });
});
