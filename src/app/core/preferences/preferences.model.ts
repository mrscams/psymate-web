import { Profession } from '../auth';
import { AppLocale, SubjectLabel } from '../i18n';
import { ThemePreference } from '../theme';

/** Modalité proposée en ligne (`booking.modalities`). */
export type BookingModality = 'in_person' | 'video' | 'phone';

/**
 * Plage hebdomadaire de prise de rendez-vous en ligne (`BookingWindow` du contrat 0.15.0, G Q75
 * de l'API) : jour 1 (lundi) à 7 (dimanche), début et fin `HH:mm` dans `booking.timezone`, minutes
 * multiples de 5, fin exclue et strictement après le début.
 */
export interface BookingWindow {
  day: number;
  start: string;
  end: string;
}

/**
 * Les 20 clés lues par le client (fiche 14), aux noms pointés du contrat (schéma Preferences, 21
 * clés). UX-S6 (14 novembre 2026) : `overview.view` (Simple / Complète) n'est plus lue ni écrite,
 * la vue d'ensemble n'a plus qu'une vue ; le champ reste dans le contrat. Les quatre clés
 * `agenda.*` (contrat 0.11.1+, fiche 15) sont lues par l'agenda, qui ne les écrit pas. Les huit
 * clés `booking.*` (contrat 0.15.0, G Q64) règlent la prise de rendez-vous en ligne.
 */
export interface Preferences {
  'overview.window': '30d' | '90d' | '12m';
  'timeline.groupBy': 'session' | 'month' | 'chronological';
  theme: ThemePreference;
  locale: AppLocale;
  'vocabulary.subjectLabel': SubjectLabel;
  'entryTypes.medicationVisible': boolean;
  'entries.defaultVisibility': 'clinical' | 'private';
  /** Minutes, entier de 15 à 180. */
  'sessions.defaultDurationMin': number;
  /** Première heure de la grille de l'agenda, entier de 0 à 23. */
  'agenda.dayStartHour': number;
  /** Dernière heure de la grille, entier de 1 à 24, après `agenda.dayStartHour`. */
  'agenda.dayEndHour': number;
  /** Jours travaillés, 1 (lundi) à 7 (dimanche), sans doublon, au moins un. */
  'agenda.workingDays': number[];
  'agenda.defaultView': 'day' | 'week' | 'month' | 'list';
  /** Prise de rendez-vous en ligne proposée sur la fiche publique. */
  'booking.enabled': boolean;
  /** manual : le praticien accepte chaque demande ; auto : confirmé à la vérification de l'e-mail. */
  'booking.confirmation': 'manual' | 'auto';
  /** Plages hebdomadaires, 21 au plus, sans chevauchement le même jour, triées par le serveur. */
  'booking.windows': BookingWindow[];
  /** Durée d'un créneau en minutes, entier de 15 à 180, multiple de 5. */
  'booking.slotDurationMin': number;
  /** Délai minimal en heures, entier de 1 à 168. */
  'booking.minNoticeHours': number;
  /** Horizon en jours, entier de 7 à 90. */
  'booking.horizonDays': number;
  /** Modalités proposées en ligne : liste non vide, sans doublon. */
  'booking.modalities': BookingModality[];
  /** Fuseau IANA des plages (`Europe/Paris`). */
  'booking.timezone': string;
}

export type PreferenceKey = keyof Preferences;

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  'overview.window',
  'timeline.groupBy',
  'theme',
  'locale',
  'vocabulary.subjectLabel',
  'entryTypes.medicationVisible',
  'entries.defaultVisibility',
  'sessions.defaultDurationMin',
  'agenda.dayStartHour',
  'agenda.dayEndHour',
  'agenda.workingDays',
  'agenda.defaultView',
  'booking.enabled',
  'booking.confirmation',
  'booking.windows',
  'booking.slotDurationMin',
  'booking.minNoticeHours',
  'booking.horizonDays',
  'booking.modalities',
  'booking.timezone',
];

export const SESSION_DURATION_MIN = 15;
export const SESSION_DURATION_MAX = 180;

/** Bornes des réglages `booking.*` (G Q75 de l'API, contrat 0.15.0). */
export const BOOKING_SLOT_DURATION_MIN = 15;
export const BOOKING_SLOT_DURATION_MAX = 180;
export const BOOKING_MIN_NOTICE_HOURS_MIN = 1;
export const BOOKING_MIN_NOTICE_HOURS_MAX = 168;
export const BOOKING_HORIZON_DAYS_MIN = 7;
export const BOOKING_HORIZON_DAYS_MAX = 90;
export const BOOKING_WINDOWS_MAX = 21;
export const BOOKING_MODALITIES: readonly BookingModality[] = ['in_person', 'video', 'phone'];

/** Valeurs admises par clé énumérée (contrat) ; les deux autres clés sont vérifiées à part. */
const ENUMS: { [K in PreferenceKey]?: readonly Preferences[K][] } = {
  'overview.window': ['30d', '90d', '12m'],
  'timeline.groupBy': ['session', 'month', 'chronological'],
  theme: ['light', 'soft', 'dark', 'system'],
  locale: ['fr', 'en'],
  'vocabulary.subjectLabel': ['patient', 'client'],
  'entries.defaultVisibility': ['clinical', 'private'],
  'agenda.defaultView': ['day', 'week', 'month', 'list'],
  'booking.confirmation': ['manual', 'auto'],
};

/**
 * Défauts du contrat selon la profession (fiche 14 ; G : durée de séance 60, locale fr, Q23) :
 * coach → « client » ; psychiatre → type médicament visible. Profession inconnue : défauts neutres.
 */
export function defaultPreferences(profession: Profession | null): Preferences {
  return {
    'overview.window': '90d',
    'timeline.groupBy': 'session',
    theme: 'light',
    locale: 'fr',
    'vocabulary.subjectLabel': profession === 'coach' ? 'client' : 'patient',
    'entryTypes.medicationVisible': profession === 'psychiatrist',
    'entries.defaultVisibility': 'clinical',
    'sessions.defaultDurationMin': 60,
    'agenda.dayStartHour': 8,
    'agenda.dayEndHour': 19,
    'agenda.workingDays': [1, 2, 3, 4, 5, 6],
    'agenda.defaultView': 'week',
    'booking.enabled': false,
    'booking.confirmation': 'manual',
    'booking.windows': [],
    'booking.slotDurationMin': 60,
    'booking.minNoticeHours': 24,
    'booking.horizonDays': 28,
    'booking.modalities': ['in_person'],
    'booking.timezone': 'Europe/Paris',
  };
}

/** La valeur est-elle dans le domaine de la clé ? Même forme que le serveur, qui reste juge. */
export function isValidPreference<K extends PreferenceKey>(
  key: K,
  value: unknown,
): value is Preferences[K] {
  switch (key) {
    case 'entryTypes.medicationVisible':
      return typeof value === 'boolean';
    case 'sessions.defaultDurationMin':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= SESSION_DURATION_MIN &&
        value <= SESSION_DURATION_MAX
      );
    case 'agenda.dayStartHour':
      return isIntegerIn(value, 0, 23);
    case 'agenda.dayEndHour':
      return isIntegerIn(value, 1, 24);
    case 'agenda.workingDays':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((day) => isIntegerIn(day, 1, 7)) &&
        new Set(value).size === value.length
      );
    case 'booking.enabled':
      return typeof value === 'boolean';
    case 'booking.windows':
      return isBookingWindows(value);
    case 'booking.slotDurationMin':
      return (
        isIntegerIn(value, BOOKING_SLOT_DURATION_MIN, BOOKING_SLOT_DURATION_MAX) &&
        (value as number) % 5 === 0
      );
    case 'booking.minNoticeHours':
      return isIntegerIn(value, BOOKING_MIN_NOTICE_HOURS_MIN, BOOKING_MIN_NOTICE_HOURS_MAX);
    case 'booking.horizonDays':
      return isIntegerIn(value, BOOKING_HORIZON_DAYS_MIN, BOOKING_HORIZON_DAYS_MAX);
    case 'booking.modalities':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((modality) => BOOKING_MODALITIES.includes(modality as BookingModality)) &&
        new Set(value).size === value.length
      );
    case 'booking.timezone':
      return isTimeZone(value);
    default: {
      const allowed = ENUMS[key] as readonly unknown[] | undefined;
      return allowed !== undefined && allowed.includes(value);
    }
  }
}

function isIntegerIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** `HH:mm` de 00:00 à 23:55, minutes multiples de 5 (comparable comme chaîne). */
const WINDOW_TIME = /^([01]\d|2[0-3]):[0-5][05]$/;

/**
 * Plages `booking.windows` : 21 au plus, chacune exactement `{ day, start, end }` bien formée, fin
 * après début, aucun chevauchement le même jour (contiguës admises). Une seule plage fautive rend
 * toute la liste invalide : la clé revient alors à son défaut, comme le serveur refuserait le tout.
 */
function isBookingWindows(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > BOOKING_WINDOWS_MAX) return false;
  if (!value.every(isBookingWindow)) return false;
  const windows = [...(value as BookingWindow[])].sort(
    (a, b) => a.day - b.day || a.start.localeCompare(b.start),
  );
  return windows.every(
    (window, index) =>
      index === 0 ||
      windows[index - 1].day !== window.day ||
      windows[index - 1].end <= window.start,
  );
}

function isBookingWindow(value: unknown): value is BookingWindow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3) return false;
  const { day, start, end } = value as Record<string, unknown>;
  return (
    isIntegerIn(day, 1, 7) &&
    typeof start === 'string' &&
    typeof end === 'string' &&
    WINDOW_TIME.test(start) &&
    WINDOW_TIME.test(end) &&
    start < end
  );
}

/**
 * Fuseau IANA (`Europe/Paris`, `UTC`) : un nom que le moteur Intl connaît. Les décalages (`+02:00`),
 * que certains moteurs acceptent, sont refusés comme par le serveur, qui reste juge.
 */
function isTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Complète un objet quelconque (réponse serveur, cache local) en 20 préférences valides : une clé
 * absente, inconnue ou hors domaine prend le défaut ; une fin de journée de l'agenda qui ne suit
 * pas son début reprend les deux défauts. C'est ce qui rend le cache tolérant à la
 * corruption et le client indifférent à une clé que le serveur ajouterait.
 */
export function completePreferences(
  raw: unknown,
  defaults: Preferences = defaultPreferences(null),
): Preferences {
  const source =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = { ...defaults };
  for (const key of PREFERENCE_KEYS) {
    const value = source[key];
    if (isValidPreference(key, value)) result[key] = value;
  }
  const prefs = result as unknown as Preferences;
  if (prefs['agenda.dayEndHour'] <= prefs['agenda.dayStartHour']) {
    prefs['agenda.dayStartHour'] = defaults['agenda.dayStartHour'];
    prefs['agenda.dayEndHour'] = defaults['agenda.dayEndHour'];
  }
  return prefs;
}
