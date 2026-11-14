// Ligne de la liste des patients préparée pour l'affichage (maquette 01, UX-S7) : table, cartes
// mobiles et bande « Aujourd'hui » lisent les mêmes textes. Fonctions pures, locale et instant en
// argument.

import { ageInYears, formatRelativeDay, minutesBetween } from '../../../core/i18n';
import { sessionModalityLabel } from '../../../shared/ui';
import { initials } from '../../../shared/util';
import {
  demoDisplayName,
  FLAG_KINDS,
  isDemoPatient,
  PatientActivity,
  PatientView,
} from '../data/patient.model';
import { PatientListRow } from '../data/patient-list.store';
import { highlightParts } from './highlight';
import { flagLabel } from './patient-labels';

/** Tags montrés en ligne sous le nom, avant « +n » (maquette 01). */
export const INLINE_TAGS = 2;

/** Sous ce nombre de ressentis sur 30 jours, la courbe est en pointillés (maquette : « peu de points »). */
export const FEW_FEELINGS = 3;

/** Courbe de la colonne « Ressentis · 30 j » : 92 × 22, trait feeling (maquette 01 `.spark`). */
export interface Sparkline {
  path: string;
  end: { x: number; y: number };
  dashed: boolean;
  /** « Intensité moyenne sur 30 jours : de 7 à 6 sur 10 ». */
  label: string;
}

export type ActivityState = 'loading' | 'error' | 'loaded';

export interface RowView {
  patient: PatientView;
  link: string[];
  initials: string;
  name: { text: string; match: boolean }[];
  /** « 35 ans · depuis sept. 2026 · #sommeil #travail +1 », ou la ligne d'un archivé, de la démo. */
  detail: string;
  archived: boolean;
  demo: boolean;
  state: ActivityState;
  /** Séance ouverte : minutes écoulées ; null sinon. */
  liveMinutes: number | null;
  /** « 5 nov. » (année si autre que l'année en cours) ; null sans séance. */
  lastDate: string | null;
  /** Entrées depuis la séance (« 20+ » au plafond du contrat), 0 si aucune. */
  sinceCount: string | null;
  sinceWord: string;
  /** « anxiété 7/10 » : le ressenti le plus fort depuis la séance. */
  strongest: string | null;
  spark: Sparkline | null;
  /** « anxiété ↑ » et sa lecture (« en hausse »). */
  dominant: { text: string; spoken: string } | null;
  situations: { count: number; first: string | null } | null;
  flags: string[];
  drafts: string | null;
  reportMissing: boolean;
  /** Carte mobile : « 5 nov. · 2 entrées · anxiété 7/10 · compte rendu à écrire ». */
  cardLine: string;
}

/** Ligne prête pour le gabarit. */
export function rowView(row: PatientListRow, query: string, locale: string, now: Date): RowView {
  const patient = row.patient;
  const demo = isDemoPatient(patient);
  const shown = demoDisplayName(patient);
  const archived = !!patient.archivedAt;
  const activity = row.activity;
  const state: ActivityState = activity
    ? 'loaded'
    : row.cell?.status === 'error'
      ? 'error'
      : 'loading';
  const order: readonly string[] = ['risk', 'watch', 'shared_care'];
  const view: Omit<RowView, 'cardLine'> = {
    patient,
    link: ['/patients', patient.id],
    initials: initials(shown),
    name: highlightParts(shown, query.startsWith('#') ? '' : query),
    detail: [detail(patient, activity, demo, archived, locale, now), tagLine(patient)]
      .filter(Boolean)
      .join(' · '),
    archived,
    demo,
    state,
    liveMinutes: activity?.openSessionAt ? minutesBetween(activity.openSessionAt, now) : null,
    lastDate: activity?.lastSession ? shortDate(activity.lastSession.at, locale, now) : null,
    sinceCount: activity && activity.since.entries > 0 ? sinceCount(activity) : null,
    sinceWord: activity ? entriesWord(activity.since.entries) : '',
    strongest: activity?.since.strongest
      ? feelingText(activity.since.strongest.label, activity.since.strongest.intensity, locale)
      : null,
    spark: activity ? sparkline(activity, locale) : null,
    dominant: activity?.dominant ? dominantText(activity.dominant, locale) : null,
    situations: activity ? activity.situations : null,
    flags: patient.flags
      .filter((flag) => FLAG_KINDS.includes(flag.kind))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .map((flag) => flagLabel(flag.kind)),
    drafts: activity && activity.drafts > 0 ? draftsText(activity.drafts) : null,
    reportMissing: !!activity?.lastSession?.reportMissing && !activity.openSessionAt,
  };
  return { ...view, cardLine: cardLine(view) };
}

/** « #sommeil #travail +2 » : deux tags puis le nombre des autres. */
function tagLine(patient: PatientView): string {
  const tags = patient.tags.map((tag) => `#${tag.label}`);
  const more = tags.length - INLINE_TAGS;
  return [...tags.slice(0, INLINE_TAGS), ...(more > 0 ? [`+${more}`] : [])].join(' ');
}

/** Ligne secondaire d'une carte mobile (maquette `.phone`). */
function cardLine(view: Omit<RowView, 'cardLine'>): string {
  if (view.state !== 'loaded') return view.detail;
  const parts: string[] = [];
  if (view.lastDate && view.liveMinutes === null) parts.push(view.lastDate);
  if (view.sinceCount) {
    parts.push(`${view.sinceCount} ${view.sinceWord}`);
    if (view.strongest) parts.push(view.strongest);
  }
  if (view.drafts) parts.push(view.drafts);
  if (view.reportMissing) parts.push(reportText());
  return parts.join(' · ');
}

/** « compte rendu à écrire » (colonne Attention, carte mobile, bande du jour). */
export function reportText(): string {
  return $localize`:Puce d'attention de la liste@@patients.attention.report:compte rendu à écrire`;
}

/** « 5 nov. », « 5 nov. 2025 » si l'année diffère (décision 2 : la date seule). */
export function shortDate(value: string, locale: string, now: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** « 09:45 ». */
export function clockTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** « en cours · 12 min » (colonne Dernière séance). */
export function liveText(minutes: number): string {
  return $localize`:Puce d'une séance ouverte dans la liste@@patients.table.live:en cours · ${minutes}:minutes: min`;
}

/** « 12 min » (carte mobile). */
export function liveShort(minutes: number): string {
  return $localize`:Puce d'une séance ouverte, carte mobile@@patients.card.live:${minutes}:minutes: min`;
}

function detail(
  patient: PatientView,
  activity: PatientActivity | null,
  demo: boolean,
  archived: boolean,
  locale: string,
  now: Date,
): string {
  if (archived) {
    const when = formatRelativeDay(patient.archivedAt!, locale, now);
    return $localize`:Date d'archivage dans la liste@@patients.table.archivedSince:Archivé·e ${when}:when:`;
  }
  if (demo) {
    return $localize`:Sous-titre du patient de démonstration@@patients.demo.detail:données fictives · supprimable`;
  }
  const parts: string[] = [];
  const age = ageInYears(patient.birthDate, now);
  if (age !== null) {
    parts.push($localize`:Âge dans la liste des patients@@patients.table.ageYears:${age}:age: ans`);
  }
  const since = patient.followUp.since ?? activity?.followedSince ?? null;
  if (since) {
    const date = new Date(since);
    if (!Number.isNaN(date.getTime())) {
      const month = new Intl.DateTimeFormat(locale, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
      parts.push(
        $localize`:Début du suivi dans la liste (« depuis sept. 2026 »)@@patients.table.followedSince:depuis ${month}:month:`,
      );
    }
  }
  return parts.join(' · ');
}

function sinceCount(activity: PatientActivity): string {
  return activity.since.capped ? `${activity.since.entries}+` : `${activity.since.entries}`;
}

function entriesWord(count: number): string {
  return count === 1
    ? $localize`:Après le nombre d'entrées depuis la séance, une@@patients.since.entry:entrée`
    : $localize`:Après le nombre d'entrées depuis la séance, plusieurs@@patients.since.entries:entrées`;
}

function feelingText(label: string, intensity: number, locale: string): string {
  const name = label.toLocaleLowerCase(locale);
  return $localize`:Ressenti le plus fort depuis la séance (« anxiété 7/10 »)@@patients.since.strongest:${name}:emotion: ${intensity}:intensity:/10`;
}

function dominantText(
  dominant: { label: string; delta: number },
  locale: string,
): { text: string; spoken: string } {
  const name = dominant.label.toLocaleLowerCase(locale);
  if (dominant.delta > 0) {
    return {
      text: `${name} ↑`,
      spoken: $localize`:Émotion dominante en hausse (lecteur d'écran)@@patients.dominant.up:${name}:emotion: en hausse`,
    };
  }
  if (dominant.delta < 0) {
    return {
      text: `${name} ↓`,
      spoken: $localize`:Émotion dominante en baisse (lecteur d'écran)@@patients.dominant.down:${name}:emotion: en baisse`,
    };
  }
  return {
    text: `${name} =`,
    spoken: $localize`:Émotion dominante stable (lecteur d'écran)@@patients.dominant.stable:${name}:emotion: stable`,
  };
}

function draftsText(count: number): string {
  return count === 1
    ? $localize`:Puce d'un brouillon dans la liste@@patients.table.draftOne:1 brouillon`
    : $localize`:Puce de plusieurs brouillons dans la liste@@patients.table.drafts:${count}:count: brouillons`;
}

const SPARK = { width: 92, height: 22, left: 2, right: 90, top: 2, bottom: 20 };

/**
 * Courbe des intensités moyennes des 30 derniers jours (trend.points, 0 à 10) : un point par jour
 * renseigné, les jours sans ressenti sautés ; null sans aucun point.
 */
export function sparkline(activity: PatientActivity, locale: string): Sparkline | null {
  const values = activity.intensities;
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);
  if (points.length === 0) return null;
  const span = Math.max(1, values.length - 1);
  const x = (index: number) => round(SPARK.left + ((SPARK.right - SPARK.left) * index) / span);
  const y = (value: number) =>
    round(SPARK.top + ((SPARK.bottom - SPARK.top) * (10 - clamp(value))) / 10);
  const path = points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.index)} ${y(point.value)}`)
    .join(' ');
  const first = points[0].value;
  const last = points[points.length - 1];
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const from = number.format(first);
  const to = number.format(last.value);
  return {
    path,
    end: { x: x(last.index), y: y(last.value) },
    dashed: activity.feelingCount < FEW_FEELINGS,
    label: $localize`:Nom accessible de la courbe des ressentis@@patients.spark.label:Intensité moyenne sur 30 jours : de ${from}:from: à ${to}:to: sur 10`,
  };
}

function clamp(value: number): number {
  return Math.min(10, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Modalité en minuscules (« visio »), vide si inconnue. */
export function modalityText(activity: PatientActivity): string {
  return sessionModalityLabel(activity.lastSession?.modality ?? null);
}
