// Vue décennie de la timeline (fiche 03, état C ; M3-04) : ce que le résumé mensuel donne
// (GET …/timeline/summary?granularity=month), la « plage » de la timeline et la règle de bascule
// entre le détail (états A et B) et l'agrégat par mois. Calculs purs, aucun texte ici.

import { EntryType } from '../../../shared/ui';

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

/** idle | loading (résumé demandé) | loaded | error (résumé en échec). */
export type DecadeStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * La plage de la timeline, en mois bornes incluses (`start` ≤ `end`), avec les jours de ses bornes
 * quand ils sont connus (AAAA-MM-JJ) : voir `plageOf`.
 */
export interface Plage {
  start: number;
  end: number;
  startDay?: string | null;
  endDay?: string | null;
}

/** Une période de filtres (jours AAAA-MM-JJ, `to` inclus) : celle d'avant un double-clic sur un mois. */
export interface DecadePeriod {
  from: string | null;
  to: string | null;
}

/**
 * Au-delà de 3 ans, la timeline passe d'elle-même à l'agrégat (fiche 03) : en jours civils quand les
 * deux bornes sont des jours connus, sinon plus de 36 mois couverts.
 */
export const DECADE_THRESHOLD_MONTHS = 36;

/** Vue de la timeline chronologique : le détail (cartes) ou l'agrégat par mois. */
export type DecadeView = 'detail' | 'decade';

/** Ce que l'onglet range de la vue décennie (rememberTab), pour la retrouver au retour. */
export interface DecadeSnapshot {
  periods: TimelinePeriod[];
  range: DecadeRange;
  manual: DecadeView | null;
  /** Période d'avant le double-clic sur un mois : `Échap` y revient. */
  drillBack: DecadePeriod | null;
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

/** Le jour AAAA-MM-JJ en tête d'une date ou d'une date-heure ISO ; null sinon. */
function dayOf(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Le même jour `years` ans plus tard (AAAA-MM-JJ ; le 29 février reste comparable). */
export function addYears(day: string, years: number): string {
  return `${String(Number(day.slice(0, 4)) + years).padStart(4, '0')}${day.slice(4)}`;
}

/** Une borne de plage : son mois, et son jour quand il est connu (filtre ou début du suivi). */
interface Bound {
  month: number;
  day: string | null;
}

function clinicalBound(
  periods: readonly TimelinePeriod[],
  followedSince: string | null,
): Bound | null {
  const firstSession = periods.find((p) => (p.counts.session ?? 0) > 0)?.month ?? null;
  const followDay = dayOf(followedSince);
  const follow = dayMonth(followDay);
  // Le début du suivi l'emporte s'il précède le mois de la première séance : son jour est connu.
  // Dans le même mois, la séance a pu avoir lieu avant ce jour : on garde le mois.
  if (follow !== null && (firstSession === null || follow < firstSession)) {
    return { month: follow, day: followDay };
  }
  if (firstSession !== null) return { month: firstSession, day: null };
  const first = periods[0]?.month;
  return first === undefined ? null : { month: first, day: null };
}

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
  return clinicalBound(periods, followedSince)?.month ?? null;
}

/**
 * La plage de la timeline (M3-04), en mois bornes incluses, avec ses jours quand ils sont connus :
 * - début : le premier jour de la période des filtres, sinon le début clinique (`clinicalStart` :
 *   jour du début du suivi, ou mois de la première séance du résumé) ;
 * - fin : le dernier jour de la période des filtres, sinon le dernier mois non vide du résumé.
 * Null tant que rien ne la borne (aucune période, aucune entrée). Avec une période `from` et `to`,
 * le résumé n'est pas nécessaire (`periods` vide).
 */
export function plageOf(
  range: DecadeRange,
  periods: readonly TimelinePeriod[],
  followedSince: string | null,
): Plage | null {
  const fromMonth = dayMonth(range.fromDay);
  const start: Bound | null =
    fromMonth !== null
      ? { month: fromMonth, day: range.fromDay }
      : clinicalBound(periods, followedSince);
  if (!start) return null;
  const toMonth = dayMonth(range.toDay);
  const last = periods.at(-1)?.month;
  const end: Bound =
    toMonth !== null
      ? { month: toMonth, day: range.toDay }
      : { month: last ?? start.month, day: last === undefined ? start.day : null };
  if (end.month < start.month)
    return { start: start.month, end: start.month, startDay: start.day, endDay: start.day };
  return { start: start.month, end: end.month, startDay: start.day, endDay: end.day };
}

/** Nombre de mois couverts par la plage (bornes incluses). */
export function plageMonths(plage: Plage): number {
  return plage.end - plage.start + 1;
}

/**
 * La plage dépasse 3 ans. Avec deux jours connus (période des filtres, début du suivi) : en jours
 * civils, la fin est après le même jour 3 ans plus tard (08/11/2023 → 08/11/2026 : non ; → 09/11/2026 :
 * oui). Avec une borne tirée du résumé (des mois) : plus de 36 mois couverts.
 */
export function exceedsDecade(plage: Plage | null): boolean {
  if (!plage) return false;
  if (plage.startDay && plage.endDay) return plage.endDay > addYears(plage.startDay, 3);
  return plageMonths(plage) > DECADE_THRESHOLD_MONTHS;
}

/**
 * La vue se décide sans le résumé : la période des filtres a ses deux bornes, ou commence il y a
 * moins de 3 ans (`today`, AAAA-MM-JJ) et n'a pas de fin. Un résumé lent ne bloque alors pas le
 * détail.
 */
export function decidedWithoutSummary(range: DecadeRange, today: string): boolean {
  if (!range.fromDay) return false;
  return !!range.toDay || addYears(range.fromDay, 3) >= today;
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
