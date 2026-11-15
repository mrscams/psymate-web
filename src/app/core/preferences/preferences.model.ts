import { Profession } from '../auth';
import { AppLocale, SubjectLabel } from '../i18n';
import { ThemePreference } from '../theme';

/**
 * Les 12 clés lues par le client (fiche 14), aux noms pointés du contrat (schéma Preferences).
 * UX-S6 (14 novembre 2026) : `overview.view` (Simple / Complète) n'est plus lue ni écrite, la vue
 * d'ensemble n'a plus qu'une vue ; le champ reste dans le contrat. Les quatre clés `agenda.*`
 * (contrat 0.11.1+, fiche 15) sont lues par l'agenda, qui ne les écrit pas.
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
];

export const SESSION_DURATION_MIN = 15;
export const SESSION_DURATION_MAX = 180;

/** Valeurs admises par clé énumérée (contrat) ; les deux autres clés sont vérifiées à part. */
const ENUMS: { [K in PreferenceKey]?: readonly Preferences[K][] } = {
  'overview.window': ['30d', '90d', '12m'],
  'timeline.groupBy': ['session', 'month', 'chronological'],
  theme: ['light', 'soft', 'dark', 'system'],
  locale: ['fr', 'en'],
  'vocabulary.subjectLabel': ['patient', 'client'],
  'entries.defaultVisibility': ['clinical', 'private'],
  'agenda.defaultView': ['day', 'week', 'month', 'list'],
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
    default: {
      const allowed = ENUMS[key] as readonly unknown[] | undefined;
      return allowed !== undefined && allowed.includes(value);
    }
  }
}

function isIntegerIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Complète un objet quelconque (réponse serveur, cache local) en 12 préférences valides : une clé
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
