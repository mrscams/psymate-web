/**
 * Formats Intl partagés (B7 : dates relatives et formats via Intl avec la locale du praticien,
 * UTC en transit). Chaque fonction prend la locale en argument : les composants passent LOCALE_ID.
 */

export type DateStyle = 'short' | 'medium' | 'long';

/** « 17 oct. 2026 » (medium), « 17/10/2026 » (short), « 17 octobre 2026 » (long). */
export function formatDate(
  value: string | Date,
  locale: string,
  style: DateStyle = 'medium',
  timeZone?: string,
): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone }).format(date);
}

/** « 17 oct. 2026, 14:03 ». */
export function formatDateTime(value: string | Date, locale: string, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

/** « mars 2025 » : mois et année, pour « suivie depuis ». */
export function formatMonthYear(value: string | Date, locale: string, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone }).format(date);
}

const DAY_MS = 86_400_000;

/**
 * Date relative en jours : « aujourd'hui », « hier », « il y a 3 j », « dans 2 j » (Intl, style court) ; au-delà de
 * 30 jours, la date courte. Les deux dates sont comparées dans le fuseau du navigateur.
 */
export function formatRelativeDay(
  value: string | Date,
  locale: string,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return '';
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (Math.abs(days) > 30) return formatDate(date, locale, 'medium');
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  return relative.format(days, 'day');
}

/** Minutes écoulées entre deux instants, jamais négatives (« en cours depuis 18 min »). */
export function minutesBetween(from: string | Date, to: Date = new Date()): number {
  const start = toDate(from);
  if (!start) return 0;
  return Math.max(0, Math.floor((to.getTime() - start.getTime()) / 60_000));
}

/** « 18 min », « 1 h 05 » : durée en minutes. */
export function formatMinutes(minutes: number, locale: string): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    }).format(safe);
  }
  const hours = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'short',
  }).format(Math.floor(safe / 60));
  const rest = safe % 60;
  return rest === 0 ? hours : `${hours} ${String(rest).padStart(2, '0')}`;
}

/**
 * Délai d'attente d'un Retry-After (423, 429) : « 12 s », « 14 min 32 s », « 15 min ». Unités Intl
 * courtes, lisibles dans les deux langues.
 */
export function formatDelay(seconds: number, locale: string): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const unit = (value: number, unitName: 'second' | 'minute'): string =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: unitName, unitDisplay: 'short' }).format(
      value,
    );
  if (safe < 60) return unit(safe, 'second');
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0
    ? unit(minutes, 'minute')
    : `${unit(minutes, 'minute')} ${unit(rest, 'second')}`;
}

/** Âge en années à une date donnée, ou null sans date de naissance lisible. */
export function ageInYears(
  birthDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  const birth = birthDate ? toDate(birthDate) : null;
  if (!birth) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
