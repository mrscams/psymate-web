import { EntryType } from '../../../shared/ui';
import { TimelinePeriod } from './timeline-decade.model';
import { TimelineItem, TimelinePage } from './timeline.model';

// Données de test de features/timeline (specs du modèle, du store, de la carte et de la page).

export function timelineItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'e-1',
    type: 'note',
    title: 'Point sur le sommeil',
    status: 'final',
    visibility: 'clinical',
    authorType: 'practitioner',
    occurred: { from: '2026-10-24T07:40:00Z', to: null, precision: 'exact', label: null },
    recordedAt: '2026-10-24T08:00:00Z',
    sessionId: 's-1',
    emotion: null,
    intensity: null,
    tags: [],
    linkCount: 0,
    ongoing: false,
    ...overrides,
  };
}

/** `count` éléments, du plus récent au plus ancien, un par jour à partir du 1er nov. 2026. */
export function items(
  count: number,
  prefix = 'e',
  start = Date.UTC(2026, 10, 1, 9),
): TimelineItem[] {
  return Array.from({ length: count }, (_, i) =>
    timelineItem({
      id: `${prefix}-${i}`,
      title: `${prefix} ${i}`,
      occurred: {
        from: new Date(start - i * 86_400_000).toISOString(),
        to: null,
        precision: 'exact',
        label: null,
      },
    }),
  );
}

export function timelinePage(overrides: Partial<TimelinePage> = {}): TimelinePage {
  const list = overrides.items ?? [];
  return {
    items: list,
    facets: { types: { note: list.length }, emotions: {}, tags: {} },
    ongoingSituations: [],
    nextCursor: null,
    ...overrides,
  };
}

/**
 * Une chronologie de `total` éléments découpée en pages de `size` : la page k répond au curseur
 * `c<k>` (null pour la première) ; facettes de toute la plage sur chaque page.
 */
export function pagedTimeline(total: number, size = 200) {
  const all = items(total);
  const pages = new Map<string | null, TimelinePage>();
  for (let k = 0; k * size < total; k++) {
    const slice = all.slice(k * size, (k + 1) * size);
    const last = (k + 1) * size >= total;
    pages.set(k === 0 ? null : `c${k}`, {
      items: slice,
      facets: { types: { note: total }, emotions: {}, tags: {} },
      ongoingSituations: [],
      nextCursor: last ? null : `c${k + 1}`,
    });
  }
  return { all, pages };
}

/** Un mois du résumé (vue décennie) : `period` AAAA-MM et ses comptes par type. */
export function timelinePeriod(
  period: string,
  counts: Partial<Record<EntryType, number>> = { note: 1 },
  averageIntensity: number | null = null,
): TimelinePeriod {
  const [year, month] = period.split('-').map(Number);
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return {
    period,
    month: year * 12 + month - 1,
    counts,
    total,
    feelingCount: counts.feeling ?? 0,
    averageIntensity,
  };
}

/**
 * Un résumé mensuel de `months` mois consécutifs finissant en `last` (AAAA-MM) : une séance, deux
 * notes et un ressenti par mois, intensité moyenne de 4 à 7.
 */
export function monthlySummary(months: number, last = '2026-10'): TimelinePeriod[] {
  const [year, month] = last.split('-').map(Number);
  const end = year * 12 + month - 1;
  return Array.from({ length: months }, (_, i) => {
    const index = end - months + 1 + i;
    const key = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    return timelinePeriod(key, { note: 2, feeling: 1, session: 1 }, 4 + (i % 4));
  });
}
