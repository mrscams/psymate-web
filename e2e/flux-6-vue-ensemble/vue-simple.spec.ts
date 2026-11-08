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
    const legend = feelings.getByRole('list', { name: 'Légende' });
    await expect(legend).toContainText('Anxiété (3 ressentis)');
    await expect(legend).toContainText('Joie (1 ressenti)');
    await expect(legend).toContainText('Séance');
    await expect(legend).toContainText('Début de traitement · Sertraline 50 mg');

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
    await expect(block(page, 'À compléter')).toContainText('à clôturer');
    // B9 : la place du bloc « Reçu du patient » est réservée, rien n'est dessiné.
    await expect(page.getByText('Reçu du patient')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // « Voir les données » : le tableau des ressentis (en-tête + 4 lignes).
    await feelings.getByText('Voir les données').click();
    await expect(feelings.getByRole('table')).toBeVisible();
    await expect(feelings.getByRole('row')).toHaveCount(5);
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
    await expect(block(page, 'Résumé')).toBeVisible();
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
    await expect(block(page, 'Résumé')).toHaveCount(0);
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
