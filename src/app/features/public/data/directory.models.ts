// Modèles de l'annuaire public (fiches 08, 09), tels que les écrans les lisent : le service de
// données (directory.api.ts) traduit le client généré vers ces formes, champs absents compris.

export const PROFESSIONS = ['psychologist', 'psychiatrist', 'coach'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** Liste fixe du contrat (in_person, video, home). */
export const MODALITIES = ['in_person', 'video', 'home'] as const;
export type Modality = (typeof MODALITIES)[number];

export type Availability = 'accepting' | 'waitlist' | 'closed' | 'unknown';

/**
 * Tris proposés : pertinence (défaut) et nom. Le tri par distance exige lat/lng et aucune fiche n'a
 * de position en V1 : il n'est pas proposé (fiche 08, « Écarts »).
 */
export const DIRECTORY_SORTS = ['relevance', 'name'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/** Taille de page du contrat (pageSize, toujours 20). */
export const DIRECTORY_PAGE_SIZE = 20;
/** q et city : 100 caractères au plus (contrat, 400 au-delà). */
export const DIRECTORY_TEXT_MAX = 100;

/** Recherche complète, telle que l'URL la porte (fiche 08 : un lien copié rejoue la même page). */
export interface DirectoryQuery {
  q: string;
  city: string;
  professions: string[];
  specialties: string[];
  modalities: string[];
  audiences: string[];
  languages: string[];
  accepting: boolean;
  sort: DirectorySort;
  page: number;
}

export const EMPTY_QUERY: DirectoryQuery = {
  q: '',
  city: '',
  professions: [],
  specialties: [],
  modalities: [],
  audiences: [],
  languages: [],
  accepting: false,
  sort: 'relevance',
  page: 1,
};

/** Les filtres à listes (facettes), dans l'ordre de la colonne de filtres. */
export type ListFilter = 'professions' | 'specialties' | 'audiences' | 'modalities' | 'languages';

/** Fiche résumée (Card du contrat, sans coordonnées). */
export interface PractitionerCard {
  slug: string;
  displayName: string;
  profession: string;
  titleLabel: string | null;
  verified: boolean;
  availability: Availability;
  bioExcerpt: string | null;
  city: string | null;
  specialties: string[];
  audiences: string[];
  modalities: string[];
  languages: string[];
}

export interface FacetCount {
  code: string;
  count: number;
}

/** Facettes du lot filtré, toutes pages confondues (exactes jusqu'à 500 fiches, G Q48). */
export interface DirectoryFacets {
  professions: FacetCount[];
  specialties: FacetCount[];
  modalities: FacetCount[];
  audiences: FacetCount[];
  languages: FacetCount[];
}

export interface DirectoryPage {
  items: PractitionerCard[];
  facets: DirectoryFacets;
  page: number;
  totalPages: number;
  total: number;
}

export interface VocabularyItem {
  code: string;
  labelFr: string;
  labelEn: string | null;
}

/** Listes fermées de l'annuaire (GET /api/public/directory/vocabulary). */
export interface DirectoryVocabulary {
  specialties: VocabularyItem[];
  audiences: VocabularyItem[];
  modalities: VocabularyItem[];
  languages: VocabularyItem[];
}

/** Fiche publique complète : les champs masqués par le praticien sont null. */
export interface PractitionerProfile {
  slug: string;
  displayName: string;
  profession: string;
  titleLabel: string | null;
  professionalNumber: string | null;
  verified: boolean;
  availability: Availability;
  bio: string | null;
  specialties: string[];
  audiences: string[];
  modalities: string[];
  languages: string[];
  city: string | null;
  postalCode: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  fees: string | null;
  responseDelay: string | null;
  nextSlotAt: string | null;
}

/** Message d'un visiteur (SubmitContactRequest) ; `website` est le piège à robots. */
export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
  consent: boolean;
  website: string;
  /** Instant d'affichage du formulaire, ISO 8601 UTC. */
  formShownAt: string;
}
