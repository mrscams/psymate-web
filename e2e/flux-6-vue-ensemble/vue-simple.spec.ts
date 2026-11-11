import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import {
  block,
  emptyPatient,
  isOverview,
  readOverview,
  risingFolder,
  setPreferences,
  viewToggle,
} from './overview-data';

// Vue simple « Récit » (M4-07, fiche 02 / maquette 02b, B8), contre l'API locale (seed small,
// Mailpit), jamais de mock du backend. Chaque test crée son compte jetable (préférences par défaut :
// vue simple, 90 jours) et ses dossiers par l'API ; axe-core (WCAG 2.0/2.1 A et AA) dans chaque test.

const API = 'http://localhost:8080';

/** Le bloc « Comment évoluent les ressentis » (titre suivi de la fenêtre). */
function feelingsBlock(page: Page) {
  return block(page, /^Comment évoluent les ressentis/);
}

test.describe('vue d’ensemble simple « Récit »', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Marie D. : la phrase « monte » de l’API s’affiche telle quelle, avec les blocs du récit', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-07.monte', 'psychologist');
    const folder = await risingFolder(request);
    // La phrase est lue par l'API réelle, jamais recopiée dans le test.
    const { narrative } = await readOverview(request, folder.patientId);
    const rising = narrative.sentences.find((sentence) => / monte /.test(sentence));
    expect(rising, JSON.stringify(narrative.sentences)).toBeDefined();

    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);

    // Vue par défaut : simple. En bref : toutes les phrases du serveur, dans l'ordre, mot pour mot.
    await expect(viewToggle(page).getByRole('button', { name: 'Simple' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const brief = block(page, 'En bref');
    await expect(brief.locator('.sentence')).toHaveText(narrative.sentences);
    await expect(brief.getByText(rising!, { exact: true })).toBeVisible();

    // Ressentis réels : ECharts (chargé à la demande) dessine le graphe ; description et légende.
    const feelings = feelingsBlock(page);
    await expect(feelings.locator('pm-overview-feelings-chart svg').first()).toBeVisible();
    await expect(feelings.getByRole('img')).toHaveAttribute(
      'aria-label',
      /Anxiété \(ressentis : 3\) de 3 à 8 sur 10/,
    );
    // Phrase-titre, légende de quatre éléments au plus, repères de médicament hors légende.
    await expect(feelings.locator('.headline')).toHaveText(
      'Anxiété domine : 3/10 → 6/10. Joie : 4/10.',
    );
    const legend = feelings.getByRole('list', { name: 'Légende' });
    await expect(legend.getByRole('listitem')).toHaveText([
      'Anxiété (3 ressentis)',
      'Joie (1 ressenti)',
    ]);
    await expect(feelings.locator('.markers')).toContainText(
      'Début de traitement · Sertraline 50 mg',
    );
    // Le sélecteur de fenêtre est dans la carte de la courbe (maquette 02b).
    await expect(
      feelings.getByRole('group', { name: "Période de la vue d'ensemble" }),
    ).toBeVisible();

    // Dernière séance (la plus récente : l'accueil, ouvert à la création), situations, repères.
    await expect(block(page, /^Dernière séance$/)).toContainText('Accueil');
    const situations = block(page, 'Situations en cours');
    await expect(situations).toContainText('Surcharge au travail');
    await expect(situations.getByRole('link', { name: /Voir dans le graphe/ })).toHaveAttribute(
      'href',
      new RegExp(`/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );
    await expect(block(page, /^Depuis la séance du/)).toBeVisible();
    await expect(block(page, 'Traitement')).toContainText('Sertraline 50 mg');
    await expect(block(page, 'Cadre du suivi')).toContainText('séances au total');
    const todo = block(page, 'À compléter');
    await expect(todo).toContainText('à clôturer');
    // « À compléter » sur fond ambre (warning-bg), comme la maquette 02b.
    expect(await todo.evaluate((section) => getComputedStyle(section).backgroundColor)).toBe(
      await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--warning-bg)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }),
    );
    // B9 : la place du bloc « Reçu du patient » est réservée, rien n'est dessiné.
    await expect(page.getByText('Reçu du patient')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Au clavier : « Voir les données » (Entrée sur le résumé) déplie le tableau des ressentis
    // (en-tête + 4 lignes) ; Entrée sur une émotion ouvre l'éditeur de ce ressenti (?entry=).
    const data = feelings.locator('details.data > summary');
    await data.focus();
    await expect(data).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(feelings.getByRole('table')).toBeVisible();
    await expect(feelings.getByRole('row')).toHaveCount(5);
    await expectNoAxeViolations(page);
    const first = feelings.getByRole('table').getByRole('link', { name: 'Anxiété' }).first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}\\?entry=[0-9a-f-]{36}$`),
    );
    const editor = page.getByRole('dialog').filter({ has: page.locator('pm-entry-editor-panel') });
    await expect(editor).toBeVisible();
    await expect(editor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('bascule simple ↔ complète : préférence écrite, sans rechargement ni nouvelle lecture', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-07.bascule', 'psychologist');
    const folder = await risingFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(block(page, 'En bref').locator('.sentence').first()).toBeVisible();
    await expect(
      feelingsBlock(page).locator('pm-overview-feelings-chart svg').first(),
    ).toBeVisible();

    // Témoins : un marqueur dans le document, les navigations, les lectures de la synthèse.
    await page.evaluate(() => ((window as unknown as { m407?: string }).m407 = 'même document'));
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    let reads = 0;
    page.on('response', (response) => {
      if (isOverview(response, folder.patientId)) reads++;
    });
    const url = page.url();
    const toggle = viewToggle(page);

    const toComplete = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await toggle.getByRole('button', { name: 'Complète' }).click();
    const completeSaved = await toComplete;
    expect(completeSaved.status()).toBe(200);
    expect(completeSaved.request().postDataJSON()).toEqual({ 'overview.view': 'complete' });
    await expect(block(page, 'Faits clés')).toBeVisible();
    await expect(block(page, 'En bref')).toHaveCount(0);
    let stored = await request.get(`${API}/api/me/preferences`);
    expect((await stored.json())['overview.view']).toBe('complete');

    const toSimple = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await toggle.getByRole('button', { name: 'Simple' }).click();
    expect((await toSimple).request().postDataJSON()).toEqual({ 'overview.view': 'simple' });
    await expect(block(page, 'En bref').locator('.sentence').first()).toBeVisible();
    await expect(
      feelingsBlock(page).locator('pm-overview-feelings-chart svg').first(),
    ).toBeVisible();
    await expect(block(page, 'Faits clés')).toHaveCount(0);
    stored = await request.get(`${API}/api/me/preferences`);
    expect((await stored.json())['overview.view']).toBe('simple');

    // Même document, même adresse, aucune navigation et aucune relecture de la synthèse.
    expect(await page.evaluate(() => (window as unknown as { m407?: string }).m407)).toBe(
      'même document',
    );
    expect(page.url()).toBe(url);
    expect(navigations).toBe(0);
    expect(reads).toBe(0);
    await expectNoAxeViolations(page);
  });

  test('patient sans entrée : les phrases de l’API, et chaque autre bloc avec son état', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-07.vide', 'psychologist');
    const patientId = await emptyPatient(request);
    const { narrative } = await readOverview(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);

    await expect(block(page, 'En bref').locator('.sentence')).toHaveText(narrative.sentences);
    const empties: [string | RegExp, string][] = [
      [/^Comment évoluent les ressentis/, 'Pas encore de ressentis sur cette période'],
      [/^Dernière séance$/, 'Aucune séance'],
      ['Situations en cours', 'Aucune situation en cours'],
      ['Dernières entrées', 'Rien de noté depuis'],
      ['Traitement', 'Aucun traitement en cours'],
      ['À compléter', 'Rien à compléter'],
    ];
    for (const [heading, title] of empties) {
      await expect(block(page, heading).getByRole('status')).toContainText(title);
    }
    await expect(block(page, 'Cadre du suivi')).toContainText('Aucune séance');
    await expectNoAxeViolations(page);
  });

  test('mode sombre : tokens sombres appliqués à la vue simple, axe sans violation', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-07.sombre', 'psychologist');
    await setPreferences(request, { theme: 'dark' });
    const folder = await risingFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(block(page, 'En bref').locator('.sentence').first()).toBeVisible();
    await expect(
      feelingsBlock(page).locator('pm-overview-feelings-chart svg').first(),
    ).toBeVisible();
    await expect(block(page, 'Situations en cours')).toContainText('Surcharge au travail');
    await expectNoAxeViolations(page);
  });
});
