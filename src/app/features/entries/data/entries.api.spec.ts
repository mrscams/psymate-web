import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { EntriesApi } from './entries.api';

// Le client généré n'est importé que par entries.api.ts : ici, on observe les requêtes HTTP réelles.
function setup(locale: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient(),
      { provide: LOCALE_ID, useValue: locale },
    ],
  });
  return { api: TestBed.inject(EntriesApi), http: TestBed.inject(HttpTestingController) };
}

/** Vocabulaire servi : libellés français toujours, anglais et arabe parfois (labelAr : contrat 0.16.0). */
const EMOTIONS = [
  { code: 'anxiety', family: 'fear', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'قلق' },
  { code: 'joy', family: 'joy', labelFr: 'Joie', labelEn: '' },
  { code: 'c_perf', family: 'fear', labelFr: 'Trac', scope: 'custom' },
  { code: 'unnamed', family: 'joy' },
];

const LINK_TYPES = [
  {
    code: 'triggers',
    labelFr: 'déclenche',
    labelEn: 'triggers',
    inverseLabelFr: 'déclenché par',
    inverseLabelEn: 'triggered by',
    directed: true,
    allowedSourceTypes: ['event'],
    allowedTargetTypes: ['feeling'],
  },
  { code: 'related', labelFr: 'en lien avec', directed: false },
];

async function emotionLabels(locale: string): Promise<string[]> {
  const { api, http } = setup(locale);
  const pending = api.emotions();
  http.expectOne('/api/vocabulary/emotions').flush(EMOTIONS);
  const list = await pending;
  http.verify();
  return list.map((emotion) => emotion.label);
}

async function linkLabels(locale: string): Promise<(string | null)[][]> {
  const { api, http } = setup(locale);
  const pending = api.linkTypes();
  http.expectOne('/api/vocabulary/link-types').flush(LINK_TYPES);
  const list = await pending;
  http.verify();
  return list.map((type) => [type.label, type.inverseLabel]);
}

describe('EntriesApi : libellés de catalogue dans la langue du bundle (Q78, M16-19)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('français : labelFr ; le code si l’API ne donne aucun libellé', async () => {
    expect(await emotionLabels('fr')).toEqual(['Anxiété', 'Joie', 'Trac', 'unnamed']);
    expect(await linkLabels('fr')).toEqual([
      ['déclenche', 'déclenché par'],
      ['en lien avec', null],
    ]);
  });

  it('anglais : labelEn s’il existe, sinon le français', async () => {
    expect(await emotionLabels('en')).toEqual(['Anxiety', 'Joie', 'Trac', 'unnamed']);
    expect(await linkLabels('en')).toEqual([
      ['triggers', 'triggered by'],
      ['en lien avec', null],
    ]);
  });

  it('M16-25 : types de lien, labelAr et inverseLabelAr en arabe ; fr et en inchangés', async () => {
    const arabic = [
      { ...LINK_TYPES[0], labelAr: 'يُثير', inverseLabelAr: 'يُثيره' },
      { ...LINK_TYPES[1], labelAr: '' },
    ];
    async function labels(locale: string): Promise<(string | null)[][]> {
      const { api, http } = setup(locale);
      const pending = api.linkTypes();
      http.expectOne('/api/vocabulary/link-types').flush(arabic);
      const list = await pending;
      http.verify();
      return list.map((type) => [type.label, type.inverseLabel]);
    }
    expect(await labels('ar')).toEqual([
      ['يُثير', 'يُثيره'],
      ['en lien avec', null],
    ]);
    expect(await labels('fr')).toEqual(await linkLabels('fr'));
    expect(await labels('en')).toEqual(await linkLabels('en'));
  });

  it('arabe : labelAr s’il existe, sinon le français, jamais l’anglais', async () => {
    expect(await emotionLabels('ar')).toEqual(['قلق', 'Joie', 'Trac', 'unnamed']);
    expect(await linkLabels('ar')).toEqual([
      ['déclenche', 'déclenché par'],
      ['en lien avec', null],
    ]);
  });
});
