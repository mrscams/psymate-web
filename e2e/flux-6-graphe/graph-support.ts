import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, Locator, Page } from '@playwright/test';

import { createPatient, daysAgo, entry, intakeOf } from '../flux-5-timeline/timeline-data';

// Données et outils des e2e du graphe (M2-06), contre l'API réelle (jamais de mock) : dossiers
// créés par l'API dans un compte jetable, sonde du canevas, axe-core hors du canevas.

const API = 'http://localhost:8080';

/** La sonde posée par pm-graph-canvas sur son hôte (positions à l'écran, durée du layout). */
interface Probe {
  point(id: string): { x: number; y: number } | null;
  zoom(): number;
  layoutMs(): number | null;
  nodeIds(): string[];
  busy(): boolean;
}

type WithProbe = HTMLElement & { pmGraphProbe?: Probe };

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
 */
export async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  return canvas(page).evaluate((el: WithProbe) => {
    const probe = el.pmGraphProbe!;
    const box = el.getBoundingClientRect();
    const points = probe
      .nodeIds()
      .map((id) => probe.point(id))
      .filter((p): p is { x: number; y: number } => !!p);
    let best = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    let bestDistance = -1;
    for (let gx = 0.2; gx <= 0.8; gx += 0.05) {
      for (let gy = 0.15; gy <= 0.7; gy += 0.05) {
        const candidate = { x: box.left + box.width * gx, y: box.top + box.height * gy };
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
  });
}

/** axe-core (WCAG 2.0 / 2.1 A, AA) sur toute la page sauf le canevas Cytoscape. */
export async function expectNoAxeViolationsOutsideCanvas(page: Page): Promise<void> {
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('pm-graph-canvas .canvas')
    .analyze();
  expect(results.violations).toEqual([]);
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
  return { patientId, situation };
}
