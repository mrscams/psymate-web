import { Profession } from '../auth';
import { AppLocale, SubjectLabel } from '../i18n';
import { ThemePreference } from '../theme';

/**
 * Les 8 clés lues et écrites par le client (fiche 14), aux noms pointés du contrat (schéma
 * Preferences). UX-S6 (14 novembre 2026) : `overview.view` (Simple / Complète) n'est plus lue ni
 * écrite, la vue d'ensemble n'a plus qu'une vue ; le champ reste dans le contrat.
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
    default: {
      const allowed = ENUMS[key] as readonly unknown[] | undefined;
      return allowed !== undefined && allowed.includes(value);
    }
  }
}

/**
 * Complète un objet quelconque (réponse serveur, cache local) en 8 préférences valides : une clé
 * absente, inconnue ou hors domaine prend le défaut. C'est ce qui rend le cache tolérant à la
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
  return result as unknown as Preferences;
}
