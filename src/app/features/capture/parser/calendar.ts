// Dates civiles (année, mois, jour) sans fuseau, calculées en UTC pour ne jamais dépendre du fuseau de
// la machine. Le seul fuseau lu est celui injecté, pour savoir quel jour civil est « aujourd'hui ».

export interface CivilDate {
  readonly year: number;
  /** 1 à 12. */
  readonly month: number;
  readonly day: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Le jour civil de `now` dans le fuseau IANA donné. Intl.DateTimeFormat reçoit une locale et un fuseau
 * explicites : le résultat ne dépend pas de l'environnement. Lève RangeError si le fuseau est inconnu.
 */
export function civilDay(now: Date, timeZone: string): CivilDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const values: Record<string, number> = {};
  for (const part of parts) values[part.type] = Number(part.value);
  return { year: values['year'], month: values['month'], day: values['day'] };
}

function fromUtc(date: Date): CivilDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function utc(date: CivilDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromUtc(new Date(utc(date).getTime() + days * MS_PER_DAY));
}

/** Premier jour du mois décalé de `months` mois. */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const index = date.year * 12 + (date.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
}

/** 0 = dimanche … 6 = samedi. */
export function weekday(date: CivilDate): number {
  return utc(date).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Clé numérique ordonnée (AAAAMMJJ) pour comparer deux dates civiles. */
export function civilKey(date: CivilDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

/** Borne d'un jour entier, au format du contrat : « 2026-11-10T00:00:00Z ». */
export function isoDay(date: CivilDate): string {
  const pad = (value: number, length: number): string => String(value).padStart(length, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}T00:00:00Z`;
}
