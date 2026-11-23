import { expect, Page, test } from '@playwright/test';

import { enableProbe, graphReady, point, smallFolder } from '../flux-6-graphe/graph-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-18, vue graphe en /ar/ (G Q75 ; docs/design/arabe.md §2, §3, §5 ; fiches 04 et 06) : le graphe
// se lit vers la gauche (elk.direction LEFT, la cause à droite de son effet), de haut en bas sans
// changement, détail d'une carte, liste équivalente des liens et éditeur de lien de droite à gauche,
// sans défilement horizontal, axe-core sans violation, une capture par vue (PSYMATE_E2E_CAPTURES).
// Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du français de repli à
// l'arabe au fil du jalon. Contre l'API locale (seed small, Mailpit), jamais de mock du backend :
// dossier créé par l'API dans un compte jetable (smallFolder, comme e2e/flux-6-graphe).

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

/** Boîte d'un élément, rendue. */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} rendu`).not.toBeNull();
  return box!;
}

test.describe('vue graphe en /ar/', () => {
  test.describe.configure({ timeout: 120_000 });

  test('de droite à gauche : la cause à droite de son effet ; de haut en bas inchangé', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm16-18.sens', 'psychologist');
    const folder = await smallFolder(request);
    await enableProbe(page);
    // Connexion en /fr/ (libellés connus), puis /ar/ : la session garde le bundle de l'URL.
    await signIn(page, account);
    await page.goto(`/ar/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });
    await expectRtlPage(page);

    // Événement → situation → ressenti → médicament : chaque carte à droite de la suivante.
    const event = await point(page, folder.event);
    const situation = await point(page, folder.situation);
    const feeling = await point(page, folder.feeling);
    const medication = await point(page, folder.medication);
    expect(event.x).toBeGreaterThan(situation.x);
    expect(situation.x).toBeGreaterThan(feeling.x);
    expect(feeling.x).toBeGreaterThan(medication.x);
    // Sens par défaut : aucun paramètre d'URL, le premier segment du sens est enfoncé.
    expect(new URL(page.url()).searchParams.get('direction')).toBeNull();
    // Le repère du dessin reste de gauche à droite ; les cartes suivent la page.
    await expect(page.locator('pm-graph-canvas .world')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator(`[data-node-id="${folder.event}"]`)).toHaveAttribute('dir', 'rtl');
    await shoot(page, 'arabe-graph-horizontal');

    // De haut en bas : le paramètre d'URL garde sa valeur, le sens vertical ne change pas.
    await page.goto(
      `/ar/patients/${folder.patientId}/graph?root=${folder.situation}&direction=down`,
    );
    await graphReady(page, { count: 4 });
    await expectRtlPage(page);
    const top = await point(page, folder.event);
    const middle = await point(page, folder.situation);
    const bottom = await point(page, folder.feeling);
    expect(top.y).toBeLessThan(middle.y);
    expect(middle.y).toBeLessThan(bottom.y);
    await shoot(page, 'arabe-graph-vertical');
  });

  test('détail d’une carte et liste équivalente des liens, de droite à gauche', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm16-18.detail', 'psychologist');
    const folder = await smallFolder(request);
    await enableProbe(page);
    await signIn(page, account);
    await page.goto(`/ar/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });

    // Détail : le panneau est du côté de la fin de ligne, à gauche du graphe.
    await page.locator(`[data-node-id="${folder.feeling}"]`).click();
    await expect(page.locator('pm-graph-detail aside')).toBeVisible();
    await expect(page.locator('pm-graph-detail h2')).toHaveAttribute('dir', 'auto');
    const board = await boxOf(page, '.board');
    const detail = await boxOf(page, 'pm-graph-detail');
    expect(detail.x + detail.width).toBeLessThanOrEqual(board.x + 1);
    await expectRtlPage(page);
    await shoot(page, 'arabe-graph-detail');

    // Liste équivalente : source, lien, cible dans le sens de lecture (la source à droite).
    await page.locator('button[aria-controls="graph-links-list"]').click();
    const table = page.locator('#graph-links-list table').first();
    await expect(table).toBeVisible();
    const source = await table.locator('thead th').nth(0).boundingBox();
    const target = await table.locator('thead th').nth(2).boundingBox();
    expect(source!.x).toBeGreaterThan(target!.x);
    await expectRtlPage(page);
    await shoot(page, 'arabe-graph-liste');
  });

  test('éditeur de lien : phrase source, verbe, cible de droite à gauche, flèche retournée', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm16-18.editeur', 'psychologist');
    const folder = await smallFolder(request);
    await enableProbe(page);
    await signIn(page, account);
    await page.goto(`/ar/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });

    // Ressenti sélectionné, « Lier » de la barre d'outils (raccourci L).
    await page.locator(`[data-node-id="${folder.feeling}"]`).click();
    await page.locator('button.tool.link').click();
    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });

    // Panneau ancré à la fin de la ligne : à gauche en arabe.
    const pane = await boxOf(page, '.pm-side-panel-pane');
    expect(pane.x).toBe(0);
    // Flèche d'inversion retournée.
    await expect(dialog.locator('button.invert svg')).toHaveCSS(
      'transform',
      'matrix(-1, 0, 0, 1, 0, 0)',
    );

    // Ressenti → événement, « est causé par » : la source à droite de la cible dans la phrase.
    const radio = dialog.locator(`input[type="radio"][value="${folder.event}"]`);
    await radio.check();
    await dialog.locator('.editor pm-link-type-chips [data-code="caused_by"]').click();
    const parts = dialog.locator('.reading .sentence > *');
    await expect(parts).toHaveCount(3);
    const from = await parts.nth(0).boundingBox();
    const verb = await parts.nth(1).boundingBox();
    const to = await parts.nth(2).boundingBox();
    expect(from!.x).toBeGreaterThan(verb!.x);
    expect(verb!.x).toBeGreaterThan(to!.x);
    await expectRtlPage(page);
    await shoot(page, 'arabe-graph-editeur', false);
  });
});
