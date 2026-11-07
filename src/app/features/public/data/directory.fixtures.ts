// Jeux de données des tests de features/public (stores, composants, pages).
import {
  DirectoryFacets,
  DirectoryPage,
  DirectoryVocabulary,
  PractitionerCard,
  PractitionerProfile,
} from './directory.models';

export const NO_FACETS: DirectoryFacets = {
  professions: [],
  specialties: [],
  modalities: [],
  audiences: [],
  languages: [],
};

export const VOCABULARY: DirectoryVocabulary = {
  specialties: [
    { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
    { code: 'burnout', labelFr: 'Burn-out', labelEn: 'Burnout' },
    { code: 'grief', labelFr: 'Deuil', labelEn: null },
  ],
  audiences: [
    { code: 'adults', labelFr: 'Adultes', labelEn: 'Adults' },
    { code: 'children', labelFr: 'Enfants', labelEn: 'Children' },
  ],
  modalities: [
    { code: 'in_person', labelFr: 'Au cabinet', labelEn: 'In person' },
    { code: 'video', labelFr: 'En visio', labelEn: 'Video' },
    { code: 'home', labelFr: 'À domicile', labelEn: 'At home' },
  ],
  languages: [
    { code: 'fr', labelFr: 'Français', labelEn: 'French' },
    { code: 'en', labelFr: 'Anglais', labelEn: 'English' },
  ],
};

export const CLAIRE_CARD: PractitionerCard = {
  slug: 'claire-moreau',
  displayName: 'Claire Moreau',
  profession: 'psychologist',
  titleLabel: 'Psychologue clinicienne',
  verified: true,
  availability: 'accepting',
  bioExcerpt: 'Je reçois des **adultes**.\n- Premier échange gratuit',
  city: 'Paris',
  specialties: ['anxiety', 'burnout', 'grief', 'adhd', 'ocd'],
  audiences: ['adults'],
  modalities: ['in_person', 'video'],
  languages: ['fr', 'en'],
};

export function page(
  items: PractitionerCard[],
  overrides: Partial<DirectoryPage> = {},
): DirectoryPage {
  return {
    items,
    facets: {
      ...NO_FACETS,
      professions: items.length ? [{ code: 'psychologist', count: items.length }] : [],
      specialties: items.length ? [{ code: 'anxiety', count: items.length }] : [],
    },
    page: 1,
    totalPages: items.length ? 1 : 0,
    total: items.length,
    ...overrides,
  };
}

export const CLAIRE_PROFILE: PractitionerProfile = {
  slug: 'claire-moreau',
  displayName: 'Claire Moreau',
  profession: 'psychologist',
  titleLabel: 'Psychologue clinicienne',
  professionalNumber: '69 93 1234 5',
  verified: true,
  availability: 'accepting',
  bio: 'Je reçois des **adultes**.\n\n- Premier échange\n- Visio possible',
  specialties: ['anxiety', 'burnout'],
  audiences: ['adults'],
  modalities: ['in_person', 'video'],
  languages: ['fr', 'en'],
  city: 'Lyon',
  postalCode: '69006',
  country: 'FR',
  address: '12 rue Vendôme',
  phone: '04 00 00 00 00',
  email: null,
  websiteUrl: 'https://claire-moreau.example.test',
  fees: 'Séance 50 min : 70 €',
  responseDelay: 'sous 48 h',
  nextSlotAt: null,
};
