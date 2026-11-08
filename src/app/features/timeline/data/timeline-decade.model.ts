// Vue décennie de la timeline (fiche 03, état C ; M3-04) : ce que le résumé mensuel donne
// (GET …/timeline/summary?granularity=month), la « plage » de la timeline et la règle de bascule
// entre le détail (états A et B) et l'agrégat par mois. Calculs purs, aucun texte ici.

import { EntryType } from '../../../shared/ui';
import { TimelineFilters } from './timeline-filters.model';

/** Les comptes d'un mois non vide (TimelinePeriodDto, granularité `month`). */
export interface TimelinePeriod {
  /** AAAA-MM (UTC). */
  period: string;
  /** Rang du mois (année × 12 + mois, UTC) : l'abscisse de l'agrégat. */
  month: number;
  /** Nombre d'entrées par type ; un type absent vaut 0. */
  counts: Partial<Record<EntryType, number>>;
  /** Somme des comptes. */
  total: number;
  feelingCount: number;
  /** Intensité moyenne des ressentis du mois ; null s'il n'y en a pas. */
  averageIntensity: number | null;
}

/**
 * Fenêtre du résumé : les bornes de période des filtres, en ISO UTC pour la requête (`to` exclu) et
 * en jours calendaires du praticien pour la plage (AAAA-MM-JJ, `toDay` inclus) ; null = sans borne.
 */
export interface DecadeRange {
  from: string | null;
  to: string | null;
  fromDay: string | null;
  toDay: string | null;
}

export const NO_RANGE: DecadeRange = { from: null, to: null, fromDay: null, toDay: null };

/**
 * La plage de la timeline, en mois UTC, bornes incluses (`start` ≤ `end`) : voir `plageOf`.
 */
export interface Plage {
  start: number;
  end: number;
}

/** Au-delà de 36 mois couverts (3 ans), la timeline passe d'elle-même à l'agrégat (fiche 03). */
export const DECADE_THRESHOLD_MONTHS = 36;

/** Vue de la timeline chronologique : le détail (cartes) ou l'agrégat par mois. */
export type DecadeView = 'detail' | 'decade';

/** Ce que l'onglet range de la vue décennie (rememberTab), pour la retrouver au retour. */
export interface DecadeSnapshot {
  periods: TimelinePeriod[];
  range: DecadeRange;
  manual: DecadeView | null;
  drilled: boolean;
  /** Filtres d'avant le double-clic sur un mois : `Échap` y revient. */
  drillBack: TimelineFilters | null;
}

// ---------------------------------------------------------------- mois

/** Rang du mois UTC d'un instant ISO ; null si illisible. */
export function monthIndexOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Rang du mois d'un libellé AAAA-MM ; null si illisible. */
export function periodMonth(period: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return Number(match[1]) * 12 + month - 1;
}

/** Premier instant (UTC) du mois de rang `index`. */
export function monthStart(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

/** Rang du mois d'un jour AAAA-MM-JJ (le mois calendaire du praticien) ; null si illisible. */
export function dayMonth(day: string | null | undefined): number | null {
  return periodMonth(day?.slice(0, 7));
}

/** Libellé AAAA-MM du mois de rang `index`. */
export function monthKey(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Bornes d'un mois en jours calendaires (AAAA-MM-JJ, fin incluse), au format des filtres de période :
 * le double-clic sur un mois ouvre la timeline détaillée sur ces jours.
 */
export function monthDays(index: number): { from: string; to: string } {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

// ---------------------------------------------------------------- plage

/**
 * Début clinique du dossier, quand la période des filtres n'a pas de début : le plus ancien entre
 * le début du suivi (followedSince : followUp.since, sinon création du dossier) et le mois de la
 * première séance du résumé. Les entrées plus anciennes (enfance, période d'études…) restent en
 * « Avant le suivi » et n'étirent pas la plage. Sans l'un ni l'autre : le premier mois non vide.
 */
export function clinicalStart(
  periods: readonly TimelinePeriod[],
  followedSince: string | null,
): number | null {
  const firstSession = periods.find((p) => (p.counts.session ?? 0) > 0)?.month ?? null;
  const follow = monthIndexOf(followedSince);
  const candidates = [firstSession, follow].filter((m): m is number => m !== null);
  if (candidates.length) return Math.min(...candidates);
  return periods[0]?.month ?? null;
}

/**
 * La plage de la timeline (M3-04), en mois bornes incluses :
 * - début : le mois du premier jour de la période des filtres, sinon le début clinique
 *   (`clinicalStart`) ;
 * - fin : le mois du dernier jour de la période des filtres, sinon le dernier mois non vide du
 *   résumé.
 * Null tant que rien ne la borne (aucune période, aucune entrée).
 */
export function plageOf(
  range: DecadeRange,
  periods: readonly TimelinePeriod[],
  followedSince: string | null,
): Plage | null {
  const start = range.fromDay ? dayMonth(range.fromDay) : clinicalStart(periods, followedSince);
  const end = range.toDay ? dayMonth(range.toDay) : (periods.at(-1)?.month ?? start);
  if (start === null || end === null) return null;
  return { start, end: Math.max(start, end) };
}

/** Nombre de mois couverts par la plage (bornes incluses). */
export function plageMonths(plage: Plage): number {
  return plage.end - plage.start + 1;
}

/** La plage dépasse 3 ans : plus de 36 mois couverts. */
export function exceedsDecade(plage: Plage | null): boolean {
  return plage !== null && plageMonths(plage) > DECADE_THRESHOLD_MONTHS;
}

/**
 * La vue de la timeline chronologique, dans cet ordre :
 * 1. un choix explicite (zoom − au-delà du mois, + depuis l'agrégat) tant que la plage ne change pas ;
 * 2. après un double-clic sur un mois : le détail (même si la préférence force l'agrégat) ;
 * 3. préférence `timeline.groupBy = month` : l'agrégat, même sur une plage courte ;
 * 4. sinon, automatique : l'agrégat au-delà de 3 ans, le détail en deçà.
 */
export function decideView(input: {
  manual: DecadeView | null;
  drilled: boolean;
  forced: boolean;
  plage: Plage | null;
}): DecadeView {
  if (input.manual) return input.manual;
  if (input.drilled) return 'detail';
  if (input.forced) return 'decade';
  return exceedsDecade(input.plage) ? 'decade' : 'detail';
}

/** Même fenêtre de résumé. */
export function sameRange(a: DecadeRange, b: DecadeRange): boolean {
  return a.from === b.from && a.to === b.to;
}

// ---------------------------------------------------------------- mois de l'agrégat

/** Un mois de la plage : ses comptes (zéro s'il est vide). */
export interface DecadeMonth {
  month: number;
  key: string;
  period: TimelinePeriod | null;
}

/** Tous les mois de la plage, vides compris, du plus ancien au plus récent. */
export function plageMonthsOf(plage: Plage, periods: readonly TimelinePeriod[]): DecadeMonth[] {
  const byMonth = new Map(periods.map((p) => [p.month, p]));
  const months: DecadeMonth[] = [];
  for (let month = plage.start; month <= plage.end; month++) {
    months.push({ month, key: monthKey(month), period: byMonth.get(month) ?? null });
  }
  return months;
}

/** Entrées des mois non vides hors de la plage (avant son début ou après sa fin). */
export function outsideCount(plage: Plage, periods: readonly TimelinePeriod[]): number {
  return periods
    .filter((p) => p.month < plage.start || p.month > plage.end)
    .reduce((sum, p) => sum + p.total, 0);
}

/** Somme des comptes des types montrés. */
export function visibleTotal(period: TimelinePeriod, types: readonly EntryType[]): number {
  return types.reduce((sum, type) => sum + (period.counts[type] ?? 0), 0);
}
