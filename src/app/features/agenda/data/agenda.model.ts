import { SessionModalityCode } from '../../../shared/ui';

/**
 * Modèle de vue de l'agenda (fiches 15 et 15b). agenda.api.ts le remplit depuis le client généré
 * (contrat `contract-v0.14.0`, module `agenda` de psymate-api) ; le store et les composants ne
 * voient que ces types.
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

/** Statut : planifié, à confirmer (case « À confirmer » de 15b), annulé, fait (séance rattachée). */
export type AppointmentStatus = 'planned' | 'tentative' | 'cancelled' | 'done';

/** Patient du rendez-vous (`AppointmentDto.patient`), âge calculé depuis la date de naissance. */
export interface AppointmentPatient {
  id: string;
  displayName: string;
  /** `yyyy-MM-dd`, null si inconnue. */
  birthDate: string | null;
  age: number | null;
  archived: boolean;
}

/**
 * Invité du rendez-vous (`AppointmentDto.guest`, contrat 0.13.0) : personne sans fiche patient,
 * décrite par son nom, son prénom et son téléphone. Purgé six mois après la fin ou l'annulation du
 * rendez-vous : les trois champs passent à null et `purgedAt` est renseigné.
 */
export interface AppointmentGuest {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** Instant de la purge, ISO UTC ; null tant que l'invité n'est pas purgé. */
  purgedAt: string | null;
}

/**
 * Un rendez-vous (`AppointmentDto`). Il vise soit un patient (`patient` renseigné, `guest` null),
 * soit un invité (`patient` null, `guest` renseigné) : sans dossier, ni lien, ni contexte.
 */
export interface Appointment {
  id: string;
  patient: AppointmentPatient | null;
  guest: AppointmentGuest | null;
  /** Série de répétition ; null pour un rendez-vous isolé. */
  seriesId: string | null;
  /** Début et fin, ISO UTC (affichés dans le fuseau du navigateur). */
  startsAt: string;
  endsAt: string;
  durationMin: number;
  modality: AppointmentModality;
  status: AppointmentStatus;
  planningNote: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  /** Séance rattachée (« Démarrer la séance », M11-08, pas encore livrée) ; null sinon. */
  sessionEntryId: string | null;
}

/**
 * Indisponibilité externe (agenda Google ou Outlook, jalon ultérieur) : rendue hachurée, sans titre.
 * L'API renvoie `busy: []` en V1 ; la grille sait déjà les dessiner.
 */
export interface BusyBlock {
  id: string;
  /** Nom de l'agenda d'origine (« Google Pro »). */
  calendar: string;
  startsAt: string;
  endsAt: string;
}

/** Ce que renvoie une lecture de l'agenda sur une plage (`GET /api/agenda?from&to`). */
export interface AgendaData {
  appointments: Appointment[];
  busy: BusyBlock[];
}

/** Cases du rail gauche (fiche 15 §3) : les trois agendas de l'application, par modalité. */
export type CalendarKey = AppointmentModality;
export const CALENDAR_KEYS: readonly CalendarKey[] = ['in_person', 'video', 'phone'];

/** Rendez-vous chevauché (`ConflictDto`) : signalé, jamais bloquant (fiche 15b). */
export interface Conflict {
  appointmentId: string;
  patientDisplayName: string;
  startsAt: string;
  endsAt: string;
  /** Occurrence du créneau demandé que ce rendez-vous chevauche. */
  occurrenceStartsAt: string;
}

/** Conflits et voisinage d'un créneau (`GET /api/agenda/freebusy`). */
export interface FreeBusy {
  conflicts: Conflict[];
  previous: Appointment | null;
  next: Appointment | null;
}

/** Défauts de création pour un patient (`AppointmentDefaultsDto`). */
export interface PatientDefaults {
  durationMin: number;
  modality: AppointmentModality;
  /** Rythme du suivi, texte libre affiché tel quel ; null s'il n'est pas renseigné. */
  rhythm: string | null;
}

/** Rendez-vous à venir d'un patient et ses défauts (`GET /api/patients/{id}/appointments`). */
export interface PatientAppointments {
  appointments: Appointment[];
  defaults: PatientDefaults;
}

/** Patient proposé par la recherche du panneau 15b (patients actifs du praticien). */
export interface PatientOption {
  id: string;
  displayName: string;
  age: number | null;
}

/** Bloc « Préparer » du détail, composé depuis la vue d'ensemble du patient. */
export interface AppointmentPreparation {
  /** Début de la dernière séance clôturée, ISO ; null s'il n'y en a pas. */
  lastSessionAt: string | null;
  /** Entrées depuis la dernière séance, par nature. */
  feelings: number;
  events: number;
  others: number;
  /** Début du suivi, ISO ; null si inconnu. */
  followedSince: string | null;
}

/** Répétition d'une création : toutes les 1, 2 ou 4 semaines, un nombre ou une date de fin. */
export interface AppointmentRecurrence {
  everyWeeks: RepeatWeeks;
  count?: number;
  /** `yyyy-MM-dd`, inclus. */
  until?: string;
}

export type RepeatWeeks = 1 | 2 | 4;

/** Corps de `POST /api/appointments`. */
export interface NewAppointment {
  patientId: string;
  startsAt: string;
  durationMin: number;
  modality: AppointmentModality;
  planningNote?: string;
  tentative: boolean;
  /** Fuseau IANA du navigateur (heure locale des occurrences, lecture de `until`). */
  tz: string;
  recurrence?: AppointmentRecurrence;
}

/** Corps de `PATCH /api/appointments/{id}` (fusion partielle ; `planningNote: null` efface). */
export interface AppointmentPatch {
  startsAt?: string;
  durationMin?: number;
  modality?: AppointmentModality;
  planningNote?: string | null;
}

/** Réponse d'une création : les occurrences créées et les chevauchements constatés. */
export interface CreatedAppointments {
  appointments: Appointment[];
  conflicts: Conflict[];
}

/** Réponse d'une modification : le rendez-vous et les chevauchements constatés. */
export interface UpdatedAppointment {
  appointment: Appointment;
  conflicts: Conflict[];
}

/** Préférences `agenda.*` lues par la grille : bornes horaires, jours travaillés (1 = lundi). */
export interface AgendaHours {
  dayStartHour: number;
  dayEndHour: number;
  workingDays: readonly number[];
}

/** Défauts du contrat pour `agenda.*` (8 h, 19 h, lundi à samedi). */
export const DEFAULT_HOURS: AgendaHours = {
  dayStartHour: 8,
  dayEndHour: 19,
  workingDays: [1, 2, 3, 4, 5, 6],
};

/** Plage affichée : début inclus, fin exclue, bornes à minuit (heure locale). */
export interface AgendaRange {
  from: Date;
  to: Date;
}

/** Vue Liste : les 30 prochains jours (fiche 15, interactions). */
export const LIST_DAYS = 30;

/** Durées proposées par le panneau 15b, en minutes (la durée du patient s'y ajoute). */
export const DURATIONS_MIN: readonly number[] = [30, 45, 50, 60, 90];

/** Au plus 26 occurrences par série (contrat : 422 TOO_MANY_OCCURRENCES au-delà). */
export const MAX_OCCURRENCES = 26;

/** Motif d'annulation : 500 caractères au plus (contrat). */
export const CANCEL_REASON_MAX = 500;

/** Note de planification : 2 000 caractères au plus (contrat). */
export const PLANNING_NOTE_MAX = 2000;

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

/** L'instant est-il dans la plage (début inclus, fin exclue) ? */
export function inRange(range: AgendaRange, value: string | Date): boolean {
  const date = value instanceof Date ? value : new Date(value);
  return date >= range.from && date < range.to;
}

/** `HH:MM` → minutes depuis minuit ; null si la saisie ne se lit pas. */
export function parseTime(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** Instant local d'un jour `yyyy-MM-dd` et d'une heure `HH:MM` ; null si l'un ne se lit pas. */
export function atLocal(
  day: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  const date = fromIsoDay(day);
  const minutes = parseTime(time);
  if (!date || minutes === null) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** Fuseau IANA du navigateur (séries et voisinage, contrat : `tz`). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
}

/** Âge révolu à une date (heure locale) depuis `yyyy-MM-dd` ; null si la date ne se lit pas. */
export function ageOf(
  birthDate: string | null | undefined,
  today: Date = new Date(),
): number | null {
  const birth = fromIsoDay(birthDate);
  if (!birth || birth > today) return null;
  const before =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  return today.getFullYear() - birth.getFullYear() - (before ? 1 : 0);
}

/**
 * Occurrences d'une série telles que le serveur les posera (même heure locale, toutes les n
 * semaines) : `count` occurrences, ou jusqu'à `until` inclus. Bornée à `MAX_OCCURRENCES + 1` pour
 * que l'écran sache dire « au-delà de 26 ».
 */
export function occurrencesOf(start: Date, recurrence: AppointmentRecurrence | null): Date[] {
  if (!recurrence) return [start];
  const until = recurrence.until ? fromIsoDay(recurrence.until) : null;
  const limit = recurrence.until ? MAX_OCCURRENCES + 1 : (recurrence.count ?? 1);
  const list: Date[] = [];
  for (let index = 0; index < limit; index++) {
    const date = addDays(start, 7 * recurrence.everyWeeks * index);
    if (until && date >= addDays(until, 1)) break;
    list.push(date);
  }
  return list;
}

/** Un rendez-vous se déplace, s'annule ou se confirme tant qu'il est planifié ou à confirmer. */
export function isActive(item: Appointment): boolean {
  return item.status === 'planned' || item.status === 'tentative';
}

/**
 * « Prénom Nom » d'un invité, le nom seul sans prénom (comme `ConflictDto.patientDisplayName`) ;
 * null s'il est purgé ou sans nom. « Invité purgé » se traduit dans ui/agenda-format.ts.
 */
export function guestFullName(guest: AppointmentGuest): string | null {
  if (guest.purgedAt) return null;
  const name = [guest.firstName, guest.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ');
  return name || null;
}

/** La case du rail qui montre ou masque ce rendez-vous. */
export function calendarOf(item: Appointment): CalendarKey {
  return item.modality;
}

/** Tri chronologique, puis par identifiant pour une liste stable. */
export function byStart<T extends { startsAt: string; id: string }>(a: T, b: T): number {
  return a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);
}
