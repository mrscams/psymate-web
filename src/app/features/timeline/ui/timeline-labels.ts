// Textes de features/timeline qui dépendent d'une valeur (précision, granularité, intensité) :
// tous en $localize, jamais en dur dans un template.

import { OccurredPrecision } from '../../../shared/util';
import { TimelineZoom } from '../data/timeline.model';

/** « précision : … » (fiche 03, écarts : suivre, codes traduits). */
export function precisionLabel(precision: OccurredPrecision | null | undefined): string {
  switch (precision ?? 'exact') {
    case 'exact':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.exact:exacte`;
    case 'day':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.day:jour`;
    case 'month':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.month:mois`;
    case 'year':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.year:année`;
    case 'period':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.period:période`;
    case 'life_phase':
      return $localize`:Précision d'une date de la timeline@@timeline.precision.lifePhase:phase de vie`;
  }
}

/** Granularité courante, affichée entre − et +. */
export function zoomLabel(zoom: TimelineZoom): string {
  switch (zoom) {
    case 'day':
      return $localize`:Granularité du zoom de la timeline@@timeline.zoom.day:Jour`;
    case 'week':
      return $localize`:Granularité du zoom de la timeline@@timeline.zoom.week:Semaine`;
    case 'month':
      return $localize`:Granularité du zoom de la timeline@@timeline.zoom.month:Mois`;
  }
}

/** Opacité de la pastille de famille selon l'intensité (fiche 03 : 35 / 55 / 80 / 100 %). */
export function intensityOpacity(intensity: number | null): number {
  if (intensity === null) return 0.35;
  if (intensity >= 9) return 1;
  if (intensity >= 7) return 0.8;
  if (intensity >= 4) return 0.55;
  return 0.35;
}

/** Formateurs Intl mis en cache (l'axe en demande un par ligne et par passage). */
const formats = new Map<string, Intl.DateTimeFormat>();

function dtf(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    formats.set(key, format);
  }
  return format;
}

/** Libellé de l'axe pour le premier élément d'un groupe (jour, semaine, mois). */
export function groupLabel(
  iso: string | null | undefined,
  precision: OccurredPrecision | null | undefined,
  zoom: TimelineZoom,
  locale: string,
): { main: string; sub: string } {
  if (!iso) return { main: '', sub: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { main: '', sub: '' };
  const timeZone = (precision ?? 'exact') === 'exact' ? undefined : 'UTC';
  // L'axe n'est jamais plus fin que la date de l'élément : une année reste une année.
  if (precision === 'year' || precision === 'period' || precision === 'life_phase') {
    return {
      main: dtf(locale, { year: 'numeric', timeZone }).format(date),
      sub: '',
    };
  }
  if (zoom === 'month' || precision === 'month') {
    return {
      main: dtf(locale, { month: 'short', timeZone }).format(date),
      sub: dtf(locale, { year: 'numeric', timeZone }).format(date),
    };
  }
  if (zoom === 'week') {
    // Semaine du lundi (même découpage que groupKey dans timeline.model.ts).
    const local = timeZone === undefined;
    const weekday = ((local ? date.getDay() : date.getUTCDay()) + 6) % 7;
    const monday = new Date(date.getTime() - weekday * 86_400_000);
    const day = dtf(locale, {
      day: 'numeric',
      month: 'short',
      timeZone,
    }).format(monday);
    return {
      main: $localize`:Libellé d'une semaine sur l'axe de la timeline@@timeline.axis.week:sem. du ${day}:day:`,
      sub: dtf(locale, { year: 'numeric', timeZone }).format(monday),
    };
  }
  return {
    main: dtf(locale, { day: 'numeric', month: 'short', timeZone }).format(date),
    sub: dtf(locale, { weekday: 'short', timeZone }).format(date),
  };
}

/** Date courte d'une séance (pastille « dit en séance du … »), dans le fuseau du praticien. */
export function sessionDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dtf(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
