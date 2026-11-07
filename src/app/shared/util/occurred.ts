/** Précision du moment d'une entrée (EntryOccurredDto.precision du contrat). */
export type OccurredPrecision = 'exact' | 'day' | 'month' | 'year' | 'period' | 'life_phase';

export const OCCURRED_PRECISIONS: readonly OccurredPrecision[] = [
  'exact',
  'day',
  'month',
  'year',
  'period',
  'life_phase',
];

/** Forme minimale commune à EntryOccurredDto et aux items de recherche (occurredFrom, occurredPrecision). */
export interface Occurred {
  from?: string | null;
  to?: string | null;
  precision?: OccurredPrecision | null;
  label?: string | null;
}

export interface FormatOccurredOptions {
  /** Fuseau d'affichage d'une date-heure exacte ; par défaut celui du navigateur (handbook §6.5). */
  timeZone?: string;
}

/**
 * Le seul formatage du « quand » d'une entrée (handbook §6.5) : une chaîne par précision, dans la
 * langue donnée, via Intl. Les bornes des précisions jour, mois, année, période et phase de vie sont
 * des jours entiers UTC (contrat) : elles se lisent en UTC pour ne jamais glisser d'un jour selon le
 * fuseau ; seule la précision exact se lit dans le fuseau du praticien.
 */
export function formatOccurred(
  occurred: Occurred,
  locale: string,
  options: FormatOccurredOptions = {},
): string {
  const precision = occurred.precision ?? 'exact';
  const from = parse(occurred.from);
  const to = parse(occurred.to);
  const label = occurred.label?.trim();

  switch (precision) {
    case 'exact': {
      if (!from) return '';
      const format = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: options.timeZone,
      });
      return to && to.getTime() !== from.getTime()
        ? format.formatRange(from, to)
        : format.format(from);
    }
    case 'day':
      return range(locale, { dateStyle: 'medium', timeZone: 'UTC' }, from, to, sameUtcDay);
    case 'month':
      return range(
        locale,
        { month: 'long', year: 'numeric', timeZone: 'UTC' },
        from,
        to,
        sameUtcMonth,
      );
    case 'year':
      return range(locale, { year: 'numeric', timeZone: 'UTC' }, from, to, sameUtcYear);
    case 'period': {
      const bounds = range(
        locale,
        { month: 'short', year: 'numeric', timeZone: 'UTC' },
        from,
        to,
        sameUtcMonth,
      );
      if (label && bounds) return `${label} (${bounds})`;
      return label || bounds;
    }
    case 'life_phase':
      return label || range(locale, { year: 'numeric', timeZone: 'UTC' }, from, to, sameUtcYear);
  }
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function range(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  from: Date | null,
  to: Date | null,
  same: (a: Date, b: Date) => boolean,
): string {
  if (!from) return '';
  const format = new Intl.DateTimeFormat(locale, options);
  // La borne de fin d'une période est exclusive côté serveur (jour entier) : on recule d'une
  // milliseconde pour afficher le dernier jour inclus.
  const end = to ? new Date(to.getTime() - 1) : null;
  if (!end || end.getTime() < from.getTime() || same(from, end)) return format.format(from);
  return format.formatRange(from, end);
}

function sameUtcDay(a: Date, b: Date): boolean {
  return sameUtcMonth(a, b) && a.getUTCDate() === b.getUTCDate();
}

function sameUtcMonth(a: Date, b: Date): boolean {
  return sameUtcYear(a, b) && a.getUTCMonth() === b.getUTCMonth();
}

function sameUtcYear(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear();
}
