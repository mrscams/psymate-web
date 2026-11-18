// Modèles de vue de features/profile360 (handbook §2, couche 4 → 3 ; fiche 30, G Q53 et Q55) : ce que
// l'onglet Profil 360 affiche, préparé depuis les DTO par data/profile360.api.ts.

/** Les quatre rubriques du profil, dans l'ordre du menu et de l'API (fiche 30, Structure 1). */
export type ProfileCategory = 'history' | 'family' | 'health' | 'values_goals';

export const PROFILE_CATEGORIES: readonly ProfileCategory[] = [
  'history',
  'family',
  'health',
  'values_goals',
];

/** Rubrique affichée quand `?rubrique=` est absent ou inconnu (fiche 30, Route & module). */
export const DEFAULT_CATEGORY: ProfileCategory = 'history';

/** Paramètre d'URL de la rubrique affichée (G Q55). */
export const CATEGORY_QUERY_PARAM = 'rubrique';

/**
 * Une information du profil : titre et détail seulement (G Q53). Période et année n'existent que
 * pour Histoire et souvenirs ; l'année ne sert qu'au tri, fait par le serveur.
 */
export interface ProfileItem {
  id: string;
  category: ProfileCategory;
  title: string;
  detail: string | null;
  periodLabel: string | null;
  periodYear: number | null;
}

/** Les informations d'un profil rangées par rubrique, dans l'ordre reçu du serveur. */
export type ProfileGroups = Record<ProfileCategory, readonly ProfileItem[]>;

/** Icône d'une rubrique (fiche 30 : horloge, personnes, cœur, boussole), dessinée par ui/profile-icon. */
export type ProfileIcon = 'clock' | 'people' | 'heart' | 'compass';

/** Ce que le menu et l'en-tête de la rubrique montrent pour chaque rubrique. */
export interface ProfileCategoryMeta {
  label: string;
  /** Phrase d'aide sous le nom de la rubrique (« Les personnes qui comptent »). */
  help: string;
  icon: ProfileIcon;
}

export const CATEGORY_META: Record<ProfileCategory, ProfileCategoryMeta> = {
  history: {
    label: $localize`:Rubrique du Profil 360@@profile360.category.history:Histoire et souvenirs`,
    help: $localize`:Phrase d'aide de la rubrique Histoire et souvenirs@@profile360.category.history.help:Les périodes de vie, les tournants et les souvenirs qui comptent`,
    icon: 'clock',
  },
  family: {
    label: $localize`:Rubrique du Profil 360@@profile360.category.family:Famille et entourage`,
    help: $localize`:Phrase d'aide de la rubrique Famille et entourage@@profile360.category.family.help:Les personnes qui comptent`,
    icon: 'people',
  },
  health: {
    label: $localize`:Rubrique du Profil 360@@profile360.category.health:Santé et antécédents`,
    help: $localize`:Phrase d'aide de la rubrique Santé et antécédents@@profile360.category.health.help:Traitements, antécédents, suivis`,
    icon: 'heart',
  },
  values_goals: {
    label: $localize`:Rubrique du Profil 360@@profile360.category.values_goals:Valeurs et projets`,
    help: $localize`:Phrase d'aide de la rubrique Valeurs et projets@@profile360.category.values_goals.help:Ce vers quoi la personne veut aller`,
    icon: 'compass',
  },
};

/** « 6 informations » : le compteur d'une rubrique, lu avec son libellé (fiche 30, Accessibilité). */
export function countLabel(count: number): string {
  return count === 1
    ? $localize`:Compteur d'une rubrique, singulier@@profile360.count.one:1 information`
    : $localize`:Compteur d'une rubrique, pluriel (0 ou plus de 1)@@profile360.count.many:${count}:count: informations`;
}

/** Une rubrique connue, ou null. */
export function asCategory(value: string | null | undefined): ProfileCategory | null {
  return PROFILE_CATEGORIES.includes(value as ProfileCategory) ? (value as ProfileCategory) : null;
}

/** La rubrique demandée par `?rubrique=` : absente ou inconnue, Histoire et souvenirs. */
export function categoryFromParam(value: string | null | undefined): ProfileCategory {
  return asCategory(value) ?? DEFAULT_CATEGORY;
}

/**
 * Range les informations par rubrique sans les retrier (G Q55) : chaque rubrique garde l'ordre
 * relatif de la réponse du serveur.
 */
export function groupByCategory(items: readonly ProfileItem[]): ProfileGroups {
  const groups: Record<ProfileCategory, ProfileItem[]> = {
    history: [],
    family: [],
    health: [],
    values_goals: [],
  };
  for (const item of items) groups[item.category].push(item);
  return groups;
}

/**
 * La lettre de la pastille de Famille et entourage (fiche 30) : la première lettre du titre, en
 * capitale, sans les guillemets ou la ponctuation qui la précèdent ; à défaut, le premier caractère.
 */
export function initialOf(title: string): string {
  const letter = /\p{L}|\p{N}/u.exec(title)?.[0] ?? title.trim().charAt(0);
  return letter.toLocaleUpperCase();
}

// ---------------------------------------------------------------- écriture (M13-07, G Q54)

/** Paramètre d'URL qui ouvre le panneau en création (`?ajouter=1`, comme `/agenda?nouveau=…`). */
export const ADD_QUERY_PARAM = 'ajouter';

/** Bornes du contrat (POST et PATCH profile-items) : le client vérifie la forme, le serveur juge. */
export const TITLE_MAX = 200;
export const DETAIL_MAX = 2000;
export const PERIOD_LABEL_MAX = 60;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/**
 * Ce que le panneau saisit. Une valeur vide est null ; période et année n'ont de sens que pour
 * Histoire et souvenirs (le panneau les vide en quittant cette rubrique).
 */
export interface ProfileItemInput {
  category: ProfileCategory;
  title: string;
  detail: string | null;
  periodLabel: string | null;
  periodYear: number | null;
}

/** Corps de POST /api/patients/{id}/profile-items : les champs vides sont absents. */
export interface CreateProfileItemBody {
  category: ProfileCategory;
  title: string;
  detail?: string;
  periodLabel?: string;
  periodYear?: number;
}

/**
 * Corps de PATCH …/profile-items/{itemId} : seuls les champs modifiés ; null efface la précision,
 * la période ou l'année.
 */
export interface UpdateProfileItemBody {
  category?: ProfileCategory;
  title?: string;
  detail?: string | null;
  periodLabel?: string | null;
  periodYear?: number | null;
}

/** Les champs de période ne partent que pour Histoire et souvenirs. */
export function hasPeriod(category: ProfileCategory): boolean {
  return category === 'history';
}

/** Création : rien de vide, et jamais de période hors Histoire et souvenirs. */
export function createBody(input: ProfileItemInput): CreateProfileItemBody {
  const body: CreateProfileItemBody = { category: input.category, title: input.title };
  if (input.detail !== null) body.detail = input.detail;
  if (hasPeriod(input.category)) {
    if (input.periodLabel !== null) body.periodLabel = input.periodLabel;
    if (input.periodYear !== null) body.periodYear = input.periodYear;
  }
  return body;
}

/**
 * Modification : les seuls champs qui changent. En quittant Histoire et souvenirs, la période
 * n'est pas envoyée : le serveur l'efface lui-même (contrat, PATCH profile-items). Vide si rien ne
 * change.
 */
export function updateBody(item: ProfileItem, input: ProfileItemInput): UpdateProfileItemBody {
  const body: UpdateProfileItemBody = {};
  if (input.category !== item.category) body.category = input.category;
  if (input.title !== item.title) body.title = input.title;
  if (input.detail !== item.detail) body.detail = input.detail;
  if (hasPeriod(input.category)) {
    const label = hasPeriod(item.category) ? item.periodLabel : null;
    const year = hasPeriod(item.category) ? item.periodYear : null;
    if (input.periodLabel !== label) body.periodLabel = input.periodLabel;
    if (input.periodYear !== year) body.periodYear = input.periodYear;
  }
  return body;
}
