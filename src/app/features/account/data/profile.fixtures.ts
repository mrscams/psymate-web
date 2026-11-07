import { DirectoryVocabulary, fieldsOf, Profile, ProfileFields } from './profile.api';

/** Jeu de données des specs du profil public (store, page, composants). */
export const PROFILE: Profile = {
  slug: 'claire-martin',
  published: false,
  publishedAt: null,
  profession: 'psychologist',
  hasPhoto: false,
  updatedAt: '2026-11-07T09:00:00Z',
  displayName: 'Claire Martin',
  titleLabel: '',
  showProfessionalNumber: false,
  availability: 'unknown',
  nextSlotAt: '',
  bio: '',
  specialties: [],
  audiences: [],
  modalities: [],
  languages: [],
  fees: '',
  contactPhone: '',
  showPhone: false,
  contactEmail: '',
  showEmail: false,
  websiteUrl: '',
  responseDelay: '',
  address: '',
  postalCode: '',
  city: '',
  showAddress: false,
  country: 'FR',
};

export const VOCABULARY: DirectoryVocabulary = {
  specialties: [
    { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
    { code: 'burnout', labelFr: 'Burn-out', labelEn: 'Burnout' },
    { code: 'grief', labelFr: 'Deuil', labelEn: 'Grief' },
    { code: 'self_esteem', labelFr: 'Estime de soi', labelEn: 'Self-esteem' },
    { code: 'cbt', labelFr: 'Thérapie cognitivo-comportementale (TCC)', labelEn: null },
  ],
  audiences: [
    { code: 'adults', labelFr: 'Adultes', labelEn: 'Adults' },
    { code: 'young_adults', labelFr: 'Jeunes adultes', labelEn: 'Young adults' },
  ],
  modalities: [
    { code: 'in_person', labelFr: 'Au cabinet', labelEn: 'In person' },
    { code: 'video', labelFr: 'En visio', labelEn: 'Video' },
    { code: 'home', labelFr: 'À domicile', labelEn: 'At home' },
  ],
  languages: [
    { code: 'en', labelFr: 'anglais', labelEn: 'English' },
    { code: 'fr', labelFr: 'français', labelEn: 'French' },
  ],
};

/** Champs éditables du profil de base, modifiés. */
export function fields(changes: Partial<ProfileFields> = {}): ProfileFields {
  return { ...fieldsOf(PROFILE), ...changes };
}
