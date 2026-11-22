import { SlotWindow } from './booking.models';

/** Une fenêtre de créneaux couvre deux semaines (fiche 31), jamais plus de 31 jours (contrat). */
export const WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

/** Date du jour AAAA-MM-JJ dans un fuseau IANA (celui du praticien, pas celui du navigateur). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateKey(now, timeZone);
}

/** Date calendaire AAAA-MM-JJ d'un instant, dans un fuseau IANA. */
export function dateKey(instant: Date | string, timeZone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** AAAA-MM-JJ + n jours (calendrier, sans fuseau). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Nombre de jours de `from` à `to` (calendrier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * Fenêtre n° `index` (0 = la première) : d'aujourd'hui + 14 × index à + 13 jours, `to` inclus.
 */
export function windowAt(today: string, index: number): SlotWindow {
  const from = addDays(today, WINDOW_DAYS * index);
  return { from, to: addDays(from, WINDOW_DAYS - 1) };
}

/**
 * « Semaines suivantes » est inactif quand le premier jour de la fenêtre suivante dépasserait
 * aujourd'hui + horizonDays (fiche 31) : rien ne peut y être offert.
 */
export function hasNextWindow(today: string, index: number, horizonDays: number): boolean {
  const next = windowAt(today, index + 1);
  return daysBetween(today, next.from) <= horizonDays;
}
