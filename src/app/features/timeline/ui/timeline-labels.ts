// Textes de features/timeline qui dépendent d'une valeur (précision, granularité, intensité) :
// tous en $localize, jamais en dur dans un template.

import { EntryType } from '../../../shared/ui';
import { formatOccurred, Occurred, OccurredPrecision } from '../../../shared/util';
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
    sub: dtf(locale, { weekday: 'long', timeZone }).format(date),
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

/** Modalité d'une séance, forme courte des en-têtes et des cartes (« 50 min · cabinet »). */
export function modalityShortLabel(modality: SessionModality | null): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité courte d'une séance (en-tête, carte)@@timeline.modalityShort.inPerson:cabinet`;
    case 'video':
      return $localize`:Modalité courte d'une séance (en-tête, carte)@@timeline.modalityShort.video:visio`;
    case 'phone':
      return $localize`:Modalité courte d'une séance (en-tête, carte)@@timeline.modalityShort.phone:téléphone`;
    case 'email':
      return $localize`:Modalité courte d'une séance (en-tête, carte)@@timeline.modalityShort.email:e-mail`;
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

// ---------------------------------------------------------------- flux de la proposition 03 (UX-S9)

function capitalize(text: string, locale: string): string {
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

/** Jours calendaires entre deux dates (aujourd'hui − jour), comptés sur le calendrier. */
function daysBetween(today: Date, year: number, month: number, date: number): number {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(year, month, date);
  return Math.round((a - b) / 86_400_000);
}

/**
 * Ancre d'un jour du flux (maquette 03, colonne des dates) : « Jeudi 12 » et, dessous,
 * « aujourd'hui », « hier », « séance » (le jour commence par une séance) ou « il y a 4 j » dans
 * la semaine écoulée. Semaine : « Sem. du 9 nov. » ; mois : « Novembre » et l'année. Une date moins
 * précise que le zoom garde sa forme (« Octobre 2026 », « 2014 », le libellé d'une période).
 */
export function anchorLabel(
  occurred: Occurred,
  zoom: TimelineZoom,
  locale: string,
  today: Date,
  session = false,
): { main: string; sub: string } {
  const iso = occurred.from;
  if (!iso) return { main: '', sub: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { main: '', sub: '' };
  const precision = occurred.precision ?? 'exact';
  const timeZone = precision === 'exact' ? undefined : 'UTC';
  if (precision === 'period' || precision === 'life_phase') {
    const bounds = formatOccurred({ ...occurred, label: null, precision: 'period' }, locale);
    const label = occurred.label?.trim();
    return label ? { main: label, sub: bounds } : { main: bounds, sub: '' };
  }
  if (precision === 'year')
    return { main: dtf(locale, { year: 'numeric', timeZone }).format(date), sub: '' };
  if (precision === 'month')
    return {
      main: capitalize(
        dtf(locale, { month: 'long', year: 'numeric', timeZone }).format(date),
        locale,
      ),
      sub: '',
    };
  if (zoom === 'month')
    return {
      main: capitalize(dtf(locale, { month: 'long', timeZone }).format(date), locale),
      sub: dtf(locale, { year: 'numeric', timeZone }).format(date),
    };
  if (zoom === 'week') {
    const week = groupLabel(iso, precision, 'week', locale);
    return { main: capitalize(week.main, locale), sub: session ? sessionWord() : '' };
  }
  const local = timeZone === undefined;
  const days = daysBetween(
    today,
    local ? date.getFullYear() : date.getUTCFullYear(),
    local ? date.getMonth() : date.getUTCMonth(),
    local ? date.getDate() : date.getUTCDate(),
  );
  const main = capitalize(
    dtf(locale, { weekday: 'long', day: 'numeric', timeZone }).format(date),
    locale,
  );
  return { main, sub: relativeDay(days, session) };
}

function sessionWord(): string {
  return $localize`:Mention sous la date d'un jour de la timeline qui commence par une séance@@timeline.day.session:séance`;
}

/** Mention sous la date : aujourd'hui, hier, séance, il y a n j (dans la semaine), sinon rien. */
export function relativeDay(days: number, session: boolean): string {
  if (days === 0)
    return $localize`:Mention sous la date du jour courant dans la timeline@@timeline.day.today:aujourd'hui`;
  if (days === 1)
    return $localize`:Mention sous la date de la veille dans la timeline@@timeline.day.yesterday:hier`;
  if (session) return sessionWord();
  if (days > 1 && days < 7)
    return $localize`:Mention sous la date d'un jour récent de la timeline, en jours@@timeline.day.ago:il y a ${days}:days: j`;
  return '';
}

/** Intertitre de mois du flux (« novembre 2026 », mis en capitales par la feuille de style). */
export function monthHeading(index: number, locale: string): string {
  const date = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
  return dtf(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * Heure d'une ligne du flux (maquette 03, `.tm` en mono) : « 09:40 » pour une date-heure exacte,
 * sinon la précision (« jour », « mois », « année »…), la date étant écrite par l'ancre.
 */
export function rowTime(
  occurred: { from?: string | null; precision?: OccurredPrecision | null },
  locale: string,
): string {
  const precision = occurred.precision ?? 'exact';
  if (precision !== 'exact') return precisionLabel(precision);
  if (!occurred.from) return '';
  const date = new Date(occurred.from);
  if (Number.isNaN(date.getTime())) return '';
  return dtf(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** « depuis oct. 2026 » d'une situation en cours (bande en tête du flux). */
export function sinceLabel(iso: string | null | undefined, locale: string, utc: boolean): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const when = dtf(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: utc ? 'UTC' : undefined,
  }).format(date);
  return $localize`:Début d'une situation en cours, bande en tête de la timeline@@timeline.band.since:depuis ${when}:when:`;
}

/** La période de la timeline en toutes lettres (« 90 jours ») : colonne latérale et pied du flux. */
export function periodSpanLabel(preset: PeriodPreset | null, custom: string | null): string {
  switch (preset) {
    case '30d':
      return $localize`:Période de 30 jours, résumé de la timeline@@timeline.span.30d:30 jours`;
    case '90d':
      return $localize`:Période de 90 jours, résumé de la timeline@@timeline.span.90d:90 jours`;
    case '1y':
      return $localize`:Période d'un an, résumé de la timeline@@timeline.span.1y:1 an`;
    case 'all':
      return $localize`:Période sans borne, résumé de la timeline@@timeline.span.all:tout le dossier`;
    default:
      return custom ?? '';
  }
}
