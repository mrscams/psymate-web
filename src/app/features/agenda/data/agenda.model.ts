import { SessionModalityCode } from '../../../shared/ui';

/**
 * Modèle de vue de l'agenda (fiches 15 et 15b). Le backend (module `scheduling`) n'existe pas
 * encore : ces types décrivent ce que l'écran affiche ; agenda.api.ts les remplira depuis le client
 * généré le jour où le contrat portera l'agenda.
 */

/** Les quatre vues de la barre d'outils (fiche 15 : `/agenda?view=day|week|month|list`). */
export type AgendaView = 'day' | 'week' | 'month' | 'list';
export const AGENDA_VIEWS: readonly AgendaView[] = ['day', 'week', 'month', 'list'];
export const DEFAULT_VIEW: AgendaView = 'week';

/** Modalité d'un rendez-vous : cabinet, visio, téléphone (fiche 15, mêmes couleurs que la séance). */
export type AppointmentModality = Extract<SessionModalityCode, 'in_person' | 'video' | 'phone'>;
export const APPOINTMENT_MODALITIES: readonly AppointmentModality[] = [
  'in_person',
  'video',
  'phone',
];

/** Statut (fiche 15) : planifié, à confirmer (15b `toConfirm`), annulé, fait. */
export type AppointmentStatus = 'planned' | 'tentative' | 'cancelled' | 'done';

/** Patient tel que le détail du rendez-vous le montre (fiche 15 §5). */
export interface AppointmentPatient {
  id: string;
  displayName: string;
  age: number | null;
  /** Mois du début du suivi, ISO `yyyy-MM-dd`. */
  followedSince: string;
  /** Drapeau du dossier (« à surveiller »), null sans drapeau. */
  flag: string | null;
  /** Rythme habituel en clair (« toutes les 1 à 2 semaines »). */
  rhythm: string;
}

/** Bloc « Préparer » du détail (fiche 15 §5) : dernière séance, objectif, ce qui s'est passé depuis. */
export interface AppointmentPreparation {
  lastSessionAt: string;
  objective: string;
  feelings: number;
  feelingValues: string;
  events: number;
  eventLabel: string;
}

/** Ce qui est dans Google pour ce rendez-vous (fiche 15 §5, bloc Google). */
export interface AppointmentGoogle {
  /** Titre de l'événement copié (« Séance · M. D. »). */
  summary: string;
  /** Historique (« déplacé depuis Google le 22 oct. (9:00 → 10:00) »), null sans mouvement. */
  history: string | null;
}

export interface Appointment {
  id: string;
  patient: AppointmentPatient;
  /** Début et fin, ISO avec fuseau (UTC en transit, affichés dans le fuseau du navigateur). */
  startsAt: string;
  endsAt: string;
  modality: AppointmentModality;
  status: AppointmentStatus;
  /** Séance planifiée, ou contact téléphonique (bandeau fin de 14 px). */
  kind: 'session' | 'contact';
  sessionNumber: number;
  /** Lieu (« Cabinet · 12 rue Vendôme »), null en visio ou au téléphone. */
  place: string | null;
  planningNote: string;
  google: AppointmentGoogle | null;
  preparation: AppointmentPreparation;
}

/** Agenda Google en lecture (fiche 15 : Pro, Perso), rendu hachuré sans titre. */
export type GoogleCalendar = 'pro' | 'perso';

export interface BusyBlock {
  id: string;
  calendar: GoogleCalendar;
  startsAt: string;
  endsAt: string;
}

/** Ce que renvoie une lecture de l'agenda sur une plage (futur `GET /api/agenda?from&to`). */
export interface AgendaData {
  appointments: Appointment[];
  busy: BusyBlock[];
}

/** Cases du rail gauche (fiche 15 §3) : trois agendas de l'application, deux agendas Google. */
export type CalendarKey = AppointmentModality | 'google-pro' | 'google-perso';
export const CALENDAR_KEYS: readonly CalendarKey[] = [
  'in_person',
  'video',
  'phone',
  'google-pro',
  'google-perso',
];

/** État de synchronisation Google (fiche 15 §2) : vert, ambre, rouge, toujours avec texte. */
export interface SyncStatus {
  state: 'ok' | 'pending' | 'error';
  /** Minutes depuis la dernière synchronisation réussie. */
  minutesAgo: number;
}

/** Plage affichée : début inclus, fin exclue, bornes à minuit (heure locale). */
export interface AgendaRange {
  from: Date;
  to: Date;
}

/** Grille horaire (fiche 15 §4) : 8 h → 19 h, 52 px par heure (préférence `agenda.hours` plus tard). */
export const GRID_START_HOUR = 8;
export const GRID_END_HOUR = 19;
export const HOUR_PX = 52;

/** Vue Liste : les 30 prochains jours (fiche 15, interactions). */
export const LIST_DAYS = 30;

/** Durées proposées par le panneau 15b (segments), en minutes. */
export const DURATIONS_MIN: readonly number[] = [30, 45, 50, 60, 90];

export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Dates (heure locale du navigateur ; UTC en transit).

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Lundi de la semaine (ISO 8601) qui contient la date, à minuit. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Numéro de semaine ISO 8601 (« semaine 44 »). */
export function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  return Math.ceil(((target.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** `yyyy-MM-dd` en heure locale (paramètre `date=` de l'URL, clés de regroupement). */
export function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Lit `yyyy-MM-dd` (heure locale) ; null si la valeur n'est pas une date. */
export function fromIsoDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || toIsoDay(date) !== value ? null : date;
}

export function isAgendaView(value: unknown): value is AgendaView {
  return AGENDA_VIEWS.includes(value as AgendaView);
}

/**
 * Plage affichée par une vue autour de sa date d'ancrage : le jour ; la semaine du lundi au
 * dimanche ; le mois, complété aux semaines entières (six lignes au plus) ; la liste, 30 jours à
 * partir de la date.
 */
export function rangeFor(view: AgendaView, date: Date): AgendaRange {
  const day = startOfDay(date);
  switch (view) {
    case 'day':
      return { from: day, to: addDays(day, 1) };
    case 'week': {
      const from = startOfWeek(day);
      return { from, to: addDays(from, 7) };
    }
    case 'month': {
      const from = startOfWeek(startOfMonth(day));
      const lastDay = addDays(addMonths(day, 1), -1);
      return { from, to: addDays(startOfWeek(lastDay), 7) };
    }
    case 'list':
      return { from: day, to: addDays(day, LIST_DAYS) };
  }
}

/** Date d'ancrage après ‹ › : un jour, une semaine, un mois, ou 30 jours. */
export function stepDate(view: AgendaView, date: Date, direction: 1 | -1): Date {
  const day = startOfDay(date);
  switch (view) {
    case 'day':
      return addDays(day, direction);
    case 'week':
      return addDays(day, 7 * direction);
    case 'month':
      return addMonths(day, direction);
    case 'list':
      return addDays(day, LIST_DAYS * direction);
  }
}

/** Les jours de la plage, du premier au dernier. */
export function daysOf(range: AgendaRange): Date[] {
  const days: Date[] = [];
  for (let day = range.from; day < range.to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Minutes depuis minuit, heure locale. */
export function minutesOfDay(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function durationMin(startsAt: string, endsAt: string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
}

/** Position verticale (px) d'un instant dans la grille horaire, borné à la grille. */
export function gridTop(value: string | Date): number {
  const minutes = minutesOfDay(value) - GRID_START_HOUR * 60;
  const max = (GRID_END_HOUR - GRID_START_HOUR) * 60;
  return (Math.min(Math.max(minutes, 0), max) / 60) * HOUR_PX;
}

/**
 * Plages non travaillées de la grille (fiche 15 §4 : dimanche hachuré, demi-journées hachurées).
 * Démonstration : vendredi et samedi après 13 h, dimanche entier ; une préférence les portera.
 */
export function offHours(day: Date): { fromMinutes: number; toMinutes: number } | null {
  const weekday = day.getDay();
  if (weekday === 0) return { fromMinutes: GRID_START_HOUR * 60, toMinutes: GRID_END_HOUR * 60 };
  if (weekday === 5 || weekday === 6)
    return { fromMinutes: 13 * 60, toMinutes: GRID_END_HOUR * 60 };
  return null;
}

/** Le samedi est travaillé (teinte dans l'en-tête et la colonne, fiche 15 §4). */
export function isWorkedSaturday(day: Date): boolean {
  return day.getDay() === 6;
}

/** La case du rail qui montre ou masque cet élément. */
export function calendarOf(item: Appointment | BusyBlock): CalendarKey {
  return 'modality' in item ? item.modality : `google-${item.calendar}`;
}

/** Tri chronologique, puis par identifiant pour une liste stable. */
export function byStart<T extends { startsAt: string; id: string }>(a: T, b: T): number {
  return a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);
}
