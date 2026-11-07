import { convertToParamMap } from '@angular/router';

import {
  activeFilterCount,
  isEmptyQuery,
  paramsFromQuery,
  queryFromParams,
  sameQuery,
  sanitizeQuery,
} from './directory-query';
import { DirectoryVocabulary, EMPTY_QUERY } from './directory.models';

const vocabulary: DirectoryVocabulary = {
  specialties: [
    { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
    { code: 'burnout', labelFr: 'Burn-out', labelEn: 'Burnout' },
  ],
  audiences: [{ code: 'adults', labelFr: 'Adultes', labelEn: 'Adults' }],
  modalities: [],
  languages: [{ code: 'fr', labelFr: 'français', labelEn: 'French' }],
};

describe('directory-query', () => {
  it('lit l’URL en français : listes à virgules ou répétées, accepte, tri, page', () => {
    const query = queryFromParams(
      convertToParamMap({
        q: ' anxiété ',
        ville: 'Paris',
        profession: 'psychologist,coach',
        specialite: ['anxiety', 'burnout'],
        modalite: 'video',
        accepte: 'oui',
        tri: 'nom',
        page: '3',
      }),
    );
    expect(query).toEqual({
      ...EMPTY_QUERY,
      q: 'anxiété',
      city: 'Paris',
      professions: ['psychologist', 'coach'],
      specialties: ['anxiety', 'burnout'],
      modalities: ['video'],
      accepting: true,
      sort: 'name',
      page: 3,
    });
  });

  it('valeurs invalides : page 1, tri pertinence, texte coupé à 100 caractères', () => {
    const query = queryFromParams(
      convertToParamMap({ page: '-2', tri: 'distance', q: 'x'.repeat(150) }),
    );
    expect(query.page).toBe(1);
    expect(query.sort).toBe('relevance');
    expect(query.q).toHaveLength(100);
  });

  it('écrit une URL courte (défauts omis) et la relit à l’identique', () => {
    const query = {
      ...EMPTY_QUERY,
      city: 'Lyon',
      professions: ['psychiatrist'],
      languages: ['fr', 'en'],
      page: 2,
    };
    const params = paramsFromQuery(query);
    expect(params).toEqual({
      ville: 'Lyon',
      profession: 'psychiatrist',
      langue: 'fr,en',
      page: '2',
    });
    expect(queryFromParams(convertToParamMap(params))).toEqual(query);
    expect(paramsFromQuery(EMPTY_QUERY)).toEqual({});
  });

  it('ignore les codes hors liste fermée (G Q15) : spécialité inconnue, profession, modalité', () => {
    const clean = sanitizeQuery(
      {
        ...EMPTY_QUERY,
        professions: ['psychologist', 'personal_coach'],
        specialties: ['anxiety', 'astrologie'],
        modalities: ['video', 'telepathie'],
        audiences: ['adults', 'robots'],
        languages: ['fr', 'FRA'],
      },
      vocabulary,
    );
    expect(clean.professions).toEqual(['psychologist']);
    expect(clean.specialties).toEqual(['anxiety']);
    expect(clean.modalities).toEqual(['video']);
    expect(clean.audiences).toEqual(['adults']);
    expect(clean.languages).toEqual(['fr']);
  });

  it('sans vocabulaire : spécialités retirées (un code inconnu vaudrait un 422)', () => {
    const clean = sanitizeQuery(
      { ...EMPTY_QUERY, specialties: ['anxiety'], audiences: ['adults'] },
      null,
    );
    expect(clean.specialties).toEqual([]);
    expect(clean.audiences).toEqual(['adults']);
  });

  it('compte les filtres actifs, compare deux recherches', () => {
    const query = { ...EMPTY_QUERY, city: 'Paris', professions: ['coach'], accepting: true };
    expect(activeFilterCount(query)).toBe(2);
    expect(sameQuery(query, { ...query })).toBe(true);
    expect(sameQuery(query, { ...query, page: 2 })).toBe(false);
    expect(isEmptyQuery({ ...EMPTY_QUERY, page: 4 })).toBe(true);
    expect(isEmptyQuery(query)).toBe(false);
  });
});
