import { APIRequestContext, expect, Locator, Page } from '@playwright/test';

import { createPatient, daysAgo, entry, intakeOf } from '../flux-5-timeline/timeline-data';
import { apiDrained } from '../support/api-drain';
import { exclusive } from '../support/exclusif';
import { API } from '../support/env';

// Données et outils des e2e du graphe (M2-06), contre l'API réelle (jamais de mock) : dossiers
// créés par l'API dans un compte jetable, sonde du canevas, axe-core hors du canevas.

/** La sonde posée par pm-graph-canvas sur son hôte (positions à l'écran, durée du layout). */
interface Probe {
  point(id: string): { x: number; y: number } | null;
  zoom(): number;
  layoutMs(): number | null;
  nodeIds(): string[];
  busy(): boolean;
}

type WithProbe = HTMLElement & { pmGraphProbe?: Probe };

/**
 * Demande la sonde du canevas (pm-graph-canvas ne la pose que si globalThis.pmE2E vaut true) : à
 * appeler avant la première navigation.
 */
export async function enableProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (globalThis as { pmE2E?: boolean }).pmE2E = true;
  });
}

export function canvas(page: Page): Locator {
  return page.locator('pm-graph-canvas');
}

/**
 * Attend que le canevas ait dessiné `count` nœuds (ou au moins `min`) sans layout en cours (layout
 * fini, ou positions reprises de l'état rangé).
 */
export async function graphReady(page: Page, expected: { count?: number; min?: number }) {
  await expect
    .poll(
      () =>
        canvas(page).evaluate((el: WithProbe) => {
          const probe = el.pmGraphProbe;
          if (!probe || probe.busy() || !probe.nodeIds().length) return -1;
          return probe.nodeIds().length;
        }),
      { timeout: 20_000 },
    )
    .toBe(expected.count ?? expect.any(Number));
  if (expected.min) {
    expect(await nodeCount(page)).toBeGreaterThanOrEqual(expected.min);
  }
}

export function nodeCount(page: Page): Promise<number> {
  return canvas(page).evaluate((el: WithProbe) => el.pmGraphProbe?.nodeIds().length ?? 0);
}

export function layoutMs(page: Page): Promise<number | null> {
  return canvas(page).evaluate((el: WithProbe) => el.pmGraphProbe?.layoutMs() ?? null);
}

export function zoom(page: Page): Promise<number> {
  return canvas(page).evaluate((el: WithProbe) => el.pmGraphProbe?.zoom() ?? 0);
}

/** Centre d'un nœud dans la fenêtre. */
export async function point(page: Page, id: string): Promise<{ x: number; y: number }> {
  const found = await canvas(page).evaluate((el: WithProbe, nodeId) => {
    return el.pmGraphProbe?.point(nodeId) ?? null;
  }, id);
  expect(found, `nœud ${id} non dessiné`).not.toBeNull();
  return found!;
}

/**
 * Un point du canevas loin de tout nœud (pour un glisser de fond = déplacement de la vue) : le
 * point d'une grille le plus éloigné des nœuds dessinés, hors des boutons et de la légende.
 *
 * « Hors de » se vérifie à l'écran (elementFromPoint), pas par la place supposée des éléments : la
 * légende, dépliée à l'arrivée en bas à droite, couvre une partie de la grille, et le coin le plus
 * vide du graphe dépend de la disposition du seed. Un point sous la légende ne déplaçait pas la vue
 * et la molette y faisait défiler la page au lieu de zoomer (CI du 23 nov. 2026). `along` : les
 * décalages du geste prévu (fin du glisser, où tourne la molette), qui doivent eux aussi tomber
 * dans la fenêtre, sur la zone du canevas et pas sur un élément posé par-dessus.
 */
export async function emptySpot(
  page: Page,
  along: { dx: number; dy: number }[] = [],
): Promise<{ x: number; y: number }> {
  const found = await canvas(page).evaluate((el: WithProbe, offsets) => {
    const probe = el.pmGraphProbe!;
    const zone = el.querySelector('.viewport');
    const box = el.getBoundingClientRect();
    const points = probe
      .nodeIds()
      .map((id) => probe.point(id))
      .filter((p): p is { x: number; y: number } => !!p);
    // Sur la zone du canevas (ou une carte du dessin), dans la fenêtre, sous aucun autre élément.
    const onZone = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
      const under = document.elementFromPoint(x, y);
      return under && zone?.contains(under) ? under : null;
    };
    let best: { x: number; y: number } | null = null;
    let bestDistance = -1;
    for (let gx = 0.2; gx <= 0.8; gx += 0.05) {
      for (let gy = 0.15; gy <= 0.7; gy += 0.05) {
        const candidate = { x: box.left + box.width * gx, y: box.top + box.height * gy };
        // Le point pressé est sur le fond (pas une carte : ce serait un glisser de carte).
        const under = onZone(candidate.x, candidate.y);
        if (!under || under.closest('[data-node-id]')) continue;
        if (offsets.some(({ dx, dy }) => !onZone(candidate.x + dx, candidate.y + dy))) continue;
        const distance = Math.min(
          ...points.map((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y)),
        );
        if (distance > bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  }, along);
  expect(found, 'aucun point du fond du canevas libre pour le geste').not.toBeNull();
  return found!;
}

/** L'élément sous (x, y) est dans la zone du canevas (pas la légende, ni les boutons de zoom). */
export function onCanvasZone(page: Page, at: { x: number; y: number }): Promise<boolean> {
  return canvas(page).evaluate((el, { x, y }) => {
    const under = document.elementFromPoint(x, y);
    return !!under && !!el.querySelector('.viewport')?.contains(under);
  }, at);
}

/** Position d'une carte dans la page (indépendante du défilement de la fenêtre). */
export async function pagePoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  const at = await point(page, id);
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  return { x: at.x + scroll.x, y: at.y + scroll.y };
}

async function ok<T>(response: Promise<import('@playwright/test').APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

export interface SmallFolder {
  patientId: string;
  situation: string;
  event: string;
  feeling: string;
  medication: string;
}

/**
 * Dossier relié autour d'une situation : l'événement la déclenche, elle aggrave le ressenti, le
 * médicament traite le ressenti (3 liens, 4 nœuds). Aucun lien entre l'événement et le ressenti :
 * le glisser-déposer le crée.
 */
export async function smallFolder(api: APIRequestContext): Promise<SmallFolder> {
  const patientId = await createPatient(api, 'Lina G.');
  await intakeOf(api, patientId);
  const situation = await entry(api, patientId, {
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: { from: daysAgo(60), precision: 'day' },
  });
  const event = await entry(api, patientId, {
    type: 'event',
    title: "Entretien d'évaluation",
    links: [{ targetId: situation, linkType: 'triggers' }],
  });
  const feeling = await entry(api, patientId, {
    type: 'feeling',
    title: 'Anxiété 8/10',
    feeling: { emotionCode: 'anxiety', intensity: 8 },
    links: [{ targetId: situation, linkType: 'worsens', direction: 'incoming' }],
  });
  const medication = await entry(api, patientId, {
    type: 'medication',
    title: 'Sertraline 50 mg',
    medication: { molecule: 'Sertraline', dosage: '50 mg' },
    links: [{ targetId: feeling, linkType: 'treats' }],
  });
  return { patientId, situation, event, feeling, medication };
}

/** Liens acceptés d'une entrée (GET /api/entries/{id}/links). */
export function linksOf(
  api: APIRequestContext,
  entryId: string,
): Promise<
  { linkType: string; sourceId: string; targetId: string; provenance: string; status: string }[]
> {
  return ok(api.get(`${API}/api/entries/${entryId}/links`));
}

/**
 * Situation à laquelle `count` ressentis (degré 1, même type, même voisin) se rattachent : au-delà
 * de 150 nœuds, le serveur les regroupe en un super-nœud sn:{situation}:feeling.
 */
export async function crowdedFolder(
  api: APIRequestContext,
  count: number,
): Promise<{ patientId: string; situation: string }> {
  const patientId = await createPatient(api, 'Noé R.');
  await intakeOf(api, patientId);
  const situation = await entry(api, patientId, {
    type: 'situation',
    title: 'Déménagement',
    occurred: { from: daysAgo(90), precision: 'day' },
  });
  // Écritures en masse : sous le verrou « charge-api », suivies de la barrière apiDrained() (voir
  // e2e/support/api-drain.ts et exclusif.ts), pour ne retarder ni les e-mails ni les mesures des
  // autres tests.
  await exclusive('charge-api', async () => {
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (;;) {
          const i = next++;
          if (i >= count) return;
          await entry(api, patientId, {
            type: 'feeling',
            title: `Inquiétude ${String(i + 1).padStart(3, '0')}`,
            feeling: { emotionCode: 'anxiety', intensity: 1 + (i % 10) },
            links: [{ targetId: situation, linkType: 'part_of' }],
          });
        }
      }),
    );
    await apiDrained();
  });
  return { patientId, situation };
}
