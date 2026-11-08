// Textes de features/timeline qui dépendent d'une valeur (précision, granularité, intensité) :
// tous en $localize, jamais en dur dans un template.

import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import { PeriodPreset, TimelineMode } from '../data/timeline-filters.model';
import { SessionKind, SessionModality } from '../data/timeline-sessions.model';
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

/** Bascule Chronologique | Par séance. */
export function modeLabel(mode: TimelineMode): string {
  switch (mode) {
    case 'chronological':
      return $localize`:Mode chronologique de la timeline@@timeline.mode.chronological:Chronologique`;
    case 'session':
      return $localize`:Mode par séance de la timeline@@timeline.mode.session:Par séance`;
  }
}

/** Périodes proposées (fiche 03 : 30 j / 90 j / 1 an / Tout). */
export function periodLabel(preset: PeriodPreset): string {
  switch (preset) {
    case '30d':
      return $localize`:Période de 30 jours de la timeline@@timeline.period.30d:30 j`;
    case '90d':
      return $localize`:Période de 90 jours de la timeline@@timeline.period.90d:90 j`;
    case '1y':
      return $localize`:Période d'un an de la timeline@@timeline.period.1y:1 an`;
    case 'all':
      return $localize`:Période sans borne de la timeline@@timeline.period.all:Tout`;
  }
}

/** Nom accessible d'une période proposée (la puce affiche la forme courte). */
export function periodAccessibleLabel(preset: PeriodPreset): string {
  switch (preset) {
    case '30d':
      return $localize`:Nom accessible de la période de 30 jours de la timeline@@timeline.period.30d.name:30 derniers jours`;
    case '90d':
      return $localize`:Nom accessible de la période de 90 jours de la timeline@@timeline.period.90d.name:90 derniers jours`;
    case '1y':
      return $localize`:Nom accessible de la période d'un an de la timeline@@timeline.period.1y.name:12 derniers mois`;
    case 'all':
      return $localize`:Nom accessible de la période sans borne de la timeline@@timeline.period.all.name:Toute la période`;
  }
}

/** Modalité d'une séance. */
export function modalityLabel(modality: SessionModality | null): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité d'une séance@@timeline.modality.inPerson:Présentiel`;
    case 'video':
      return $localize`:Modalité d'une séance@@timeline.modality.video:Visio`;
    case 'phone':
      return $localize`:Modalité d'une séance@@timeline.modality.phone:Téléphone`;
    case 'email':
      return $localize`:Modalité d'une séance@@timeline.modality.email:E-mail`;
    default:
      return '';
  }
}

/** Genre d'une séance (accueil, ordinaire, contact). */
export function sessionKindLabel(kind: SessionKind | null): string {
  switch (kind) {
    case 'intake':
      return $localize`:Genre d'une séance@@timeline.sessionKind.intake:Séance d'accueil`;
    case 'contact':
      return $localize`:Genre d'une séance@@timeline.sessionKind.contact:Contact`;
    default:
      return $localize`:Genre d'une séance@@timeline.sessionKind.session:Séance`;
  }
}

/** Durée d'une séance en minutes, au format de la langue (« 50 min »). */
export function durationLabel(minutes: number, locale: string): string {
  const value = new Intl.NumberFormat(locale).format(minutes);
  return $localize`:Durée d'une séance en minutes@@timeline.session.duration:${value}:value: min`;
}

/** Date complète d'une séance (« mardi 8 octobre 2026 »), dans le fuseau du praticien. */
export function sessionLongDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dtf(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    date,
  );
}

/** Horaires d'une séance (« 15:00 – 15:50 », ou le seul début tant qu'elle est ouverte). */
export function sessionHours(from: string | null, to: string | null, locale: string): string {
  const format = dtf(locale, { hour: '2-digit', minute: '2-digit' });
  const start = from ? new Date(from) : null;
  if (!start || Number.isNaN(start.getTime())) return '';
  const end = to ? new Date(to) : null;
  return end && !Number.isNaN(end.getTime())
    ? `${format.format(start)} – ${format.format(end)}`
    : format.format(start);
}

/** Jour calendaire court (« 8 oct. 2026 ») d'une borne de période AAAA-MM-JJ. */
export function dayLabel(day: string, locale: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dtf(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  );
}

// ---------------------------------------------------------------- vue décennie (M3-04)

/** Granularité affichée entre − et + quand la timeline montre l'agrégat par mois. */
export function decadeZoomLabel(): string {
  return $localize`:Granularité du zoom de la timeline en vue décennie@@timeline.zoom.decade:Décennie`;
}

/** Nom d'un type au pluriel (légende, colonnes du tableau des mois). */
export function typePluralLabel(type: EntryType): string {
  switch (type) {
    case 'note':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.note:Notes`;
    case 'event':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.event:Événements`;
    case 'situation':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.situation:Situations`;
    case 'feeling':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.feeling:Ressentis`;
    case 'session':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.session:Séances`;
    case 'medication':
      return $localize`:Type d'entrée au pluriel, vue décennie@@timeline.decade.type.medication:Médicaments`;
  }
}

/** Mois d'un rang (année × 12 + mois, UTC) : « mars 2025 », « janv. 2023 » en court. */
export function monthLabel(index: number, locale: string, long = false): string {
  const date = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
  return dtf(locale, { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

/** Intensité moyenne au format de la langue, une décimale (« 5,2 »). */
export function averageLabel(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
