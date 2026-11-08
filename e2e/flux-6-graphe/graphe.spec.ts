import { expect, test } from '@playwright/test';

import { signedInContext } from '../flux-5-timeline/timeline-data';
import { createAccount, signIn } from '../preferences/accounts';
import { SEED } from '../support/accounts';
import {
  canvas,
  crowdedFolder,
  emptySpot,
  expectNoAxeViolationsOutsideCanvas,
  graphReady,
  layoutMs,
  linksOf,
  nodeCount,
  point,
  smallFolder,
  zoom,
} from './graph-support';

// Vue graphe (M2-06, fiche 04, B4 écran 4, B3 flux 4 variante graphe), contre l'API locale (seed
// small, Mailpit), jamais de mock du backend. Les dossiers relus sont créés par l'API dans un
// compte jetable ; la mesure « 150 nœuds » lit un patient du seed sans rien y écrire.

const API = 'http://localhost:8080';

test.describe('vue graphe', () => {
  test.describe.configure({ timeout: 120_000 });

  test('150 nœuds du seed : layout et pan/zoom mesurés (fluide), axe hors canevas', async ({
    page,
  }) => {
    // Le patient du seed dont le graphe (sans racine) est le plus grand : 150 nœuds en seed small.
    const api = await signedInContext(SEED.claire);
    const patients = (
      (await (await api.get(`${API}/api/patients`)).json()) as {
        items: { id: string }[];
      }
    ).items;
    let biggest = { id: '', nodes: 0 };
    for (const patient of patients) {
      const graph = (await (await api.get(`${API}/api/patients/${patient.id}/graph`)).json()) as {
        nodes: unknown[];
      };
      if (graph.nodes.length > biggest.nodes)
        biggest = { id: patient.id, nodes: graph.nodes.length };
    }
    await api.dispose();
    expect(biggest.nodes).toBeGreaterThanOrEqual(140);

    // Sans animation (prefers-reduced-motion) : la durée mesurée est celle du calcul du layout.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, SEED.claire);
    const started = Date.now();
    await page.goto(`/fr/patients/${biggest.id}/graph`);
    await graphReady(page, { count: biggest.nodes });
    const ready = Date.now() - started;
    const layout = (await layoutMs(page)) ?? -1;
    await expect(page.locator('.count')).toContainText(`${biggest.nodes} nœuds`);

    // Images pendant un déplacement (glisser le fond) puis un zoom à la molette.
    await page.evaluate(() => {
      const w = window as unknown as { pmFrames: number[]; pmRecording: boolean };
      w.pmFrames = [];
      w.pmRecording = true;
      let last = performance.now();
      const loop = (now: number) => {
        w.pmFrames.push(now - last);
        last = now;
        if (w.pmRecording) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const spot = await emptySpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 160, spot.y + 60, { steps: 40 });
    await page.mouse.move(spot.x - 120, spot.y - 40, { steps: 40 });
    await page.mouse.up();
    const before = await zoom(page);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, i < 6 ? -120 : 120);
      await page.waitForTimeout(30);
    }
    const frames = await page.evaluate(() => {
      const w = window as unknown as { pmFrames: number[]; pmRecording: boolean };
      w.pmRecording = false;
      return w.pmFrames.slice(1);
    });
    expect(await zoom(page)).not.toBe(before);
    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const fps = 1000 / (frames.reduce((sum, value) => sum + value, 0) / frames.length);
    const measure = {
      nodes: biggest.nodes,
      readyMs: ready,
      layoutMs: layout,
      frames: frames.length,
      medianFrameMs: Math.round(median * 10) / 10,
      p95FrameMs: Math.round(p95 * 10) / 10,
      maxFrameMs: Math.round(sorted.at(-1)! * 10) / 10,
      fps: Math.round(fps),
    };
    test
      .info()
      .annotations.push({ type: 'mesure-150-noeuds', description: JSON.stringify(measure) });
    console.log('Mesure graphe 150 nœuds :', JSON.stringify(measure));
    // Fluide : layout de 150 nœuds sous 2 s, une image médiane sous 34 ms (≥ 30 i/s) pendant le geste.
    expect(layout).toBeGreaterThan(0);
    expect(layout).toBeLessThan(2000);
    expect(median).toBeLessThan(34);

    await expectNoAxeViolationsOutsideCanvas(page);
  });

  test('glisser un nœud sur un autre : éditeur prérempli, lien manual/accepted, compteur à jour', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-06.glisser', 'psychologist');
    const folder = await smallFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });
    await expect(page.locator('.count')).toHaveText('4 nœuds · 3 liens');
    await expectNoAxeViolationsOutsideCanvas(page);

    // Événement → ressenti : glisser l'un sur l'autre (souris réelle sur le canevas).
    const from = await point(page, folder.event);
    const to = await point(page, folder.feeling);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    await page.mouse.up();

    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`link=${folder.event}`));
    await expect(dialog.locator('.card-name')).toHaveText("Entretien d'évaluation");
    await expect(dialog.getByRole('radio', { name: /Anxiété 8\/10/ })).toBeChecked();
    // Le nœud glissé est revenu à sa place.
    const back = await point(page, folder.event);
    expect(Math.hypot(back.x - from.x, back.y - from.y)).toBeLessThan(2);

    const relation = dialog.getByRole('group', { name: 'Relation', exact: true });
    await relation.getByRole('button', { name: 'déclenche', exact: true }).click();
    await expect(dialog.locator('form.editor .sentence')).toHaveText(
      "Entretien d'évaluation déclenche Anxiété 8/10",
    );
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/entries/${folder.event}/links`),
    );
    await dialog.getByRole('button', { name: 'Enregistrer le lien', exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toBeHidden();

    // Projection relue sans recharger la page : un lien de plus.
    await expect(page.locator('.count')).toHaveText('4 nœuds · 4 liens');
    const links = await linksOf(request, folder.event);
    expect(links).toContainEqual(
      expect.objectContaining({
        linkType: 'triggers',
        sourceId: folder.event,
        targetId: folder.feeling,
        provenance: 'manual',
        status: 'accepted',
      }),
    );
  });

  test('double-clic : la timeline sur l’entrée ; retour à l’onglet : zoom conservé', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-06.timeline', 'psychologist');
    const folder = await smallFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });

    await canvas(page).getByRole('button', { name: 'Zoom avant' }).click();
    const zoomed = await zoom(page);

    const target = await point(page, folder.medication);
    const focusUrl = page.waitForURL(
      new RegExp(`/fr/patients/${folder.patientId}/timeline\\?focus=${folder.medication}`),
    );
    await page.mouse.dblclick(target.x, target.y);
    await focusUrl;
    // La timeline met la carte de l'entrée en évidence (focus), puis retire ?focus=.
    await expect(page.locator(`article[data-entry-id="${folder.medication}"]`)).toBeFocused({
      timeout: 15_000,
    });

    await page.keyboard.press('3');
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );
    await graphReady(page, { count: 4 });
    await expect.poll(() => zoom(page)).toBeCloseTo(zoomed, 3);
  });

  test('liste équivalente : tableau des liens et détail, au clavier seulement ; axe hors canevas', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-06.liste', 'psychologist');
    const folder = await smallFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });

    const toggle = page.getByRole('button', { name: 'Liste des liens', exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const table = page.getByRole('table', {
      name: 'Liens du graphe (même contenu que le canevas)',
    });
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(
      table.getByRole('row').filter({ hasText: 'Sertraline 50 mg' }).getByRole('cell'),
    ).toHaveText(['Sertraline 50 mg', 'traite', 'Anxiété 8/10', 'manuel', 'accepté']);

    // Tab jusqu'à l'événement dans le tableau, Entrée : son détail, focus sur le titre, annonce.
    const eventButton = table.getByRole('button', { name: "Entretien d'évaluation" });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await eventButton.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(eventButton).toBeFocused();
    await page.keyboard.press('Enter');
    const detail = page.getByRole('complementary', { name: "Entretien d'évaluation" });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.locator('pm-graph-page [aria-live="polite"]')).toHaveText(
      "Entrée sélectionnée : Entretien d'évaluation, Événement",
    );
    await expect(detail.getByRole('heading', { level: 3 })).toHaveText('Liens de cette entrée · 1');

    // Les liens de cette entrée, en phrases : Tab puis Entrée mène à l'autre entrée.
    const sentence = detail.getByRole('button', { name: /déclenche Surcharge au travail/ });
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      if (await sentence.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(sentence).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Surcharge au travail' })).toBeVisible();

    await expectNoAxeViolationsOutsideCanvas(page);
  });

  test('super-nœud : au-delà de 150 nœuds, les ressentis sont regroupés et se déplient', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const account = await createAccount(request, 'm2-06.groupe', 'psychologist');
    const members = 155;
    const folder = await crowdedFolder(request, members);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);

    // Racine + un super-nœud (dans le canevas, plus son rattachement).
    await graphReady(page, { count: 2 });
    await expect(page.locator('.count')).toHaveText('2 nœuds · 0 liens');
    await expect(page.getByText('Graphe partiel', { exact: false })).toBeVisible();
    const groupId = `sn:${folder.situation}:feeling`;

    // Clic : le panneau du groupe ; « Déplier » (POST …/graph/expand).
    const at = await point(page, groupId);
    await page.mouse.click(at.x, at.y);
    const detail = page.getByRole('complementary', {
      name: `${members} ressentis regroupés · anxiété majoritaire`,
    });
    await expect(detail).toBeVisible();
    await expectNoAxeViolationsOutsideCanvas(page);
    const expanded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/graph/expand'),
    );
    await detail.getByRole('button', { name: 'Déplier' }).click();
    expect((await expanded).status()).toBe(200);
    await expect(page.locator('.count')).toHaveText(`${members + 1} nœuds · ${members} liens`);
    await expect.poll(() => nodeCount(page)).toBe(members + 1);
    await expect(detail).toBeHidden();
  });
});
