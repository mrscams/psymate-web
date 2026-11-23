import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { TimelineApi } from './timeline.api';

// Le client généré n'est importé que par timeline.api.ts : ici, on observe les requêtes HTTP réelles.
function setup(locale: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient(),
      { provide: LOCALE_ID, useValue: locale },
    ],
  });
  return { api: TestBed.inject(TimelineApi), http: TestBed.inject(HttpTestingController) };
}

/** Vocabulaire servi : libellés français toujours, anglais et arabe parfois (labelAr : contrat 0.16.0). */
const EMOTIONS = [
  { code: 'anxiety', family: 'fear', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'قلق' },
  { code: 'joy', family: 'joy', labelFr: 'Joie', labelEn: '' },
  { code: 'unnamed', family: 'joy' },
];

async function labels(locale: string): Promise<Record<string, string>> {
  const { api, http } = setup(locale);
  const pending = api.emotions();
  http.expectOne('/api/vocabulary/emotions').flush(EMOTIONS);
  const { labels } = await pending;
  http.verify();
  return labels;
}

describe('TimelineApi.emotions : libellé de catalogue dans la langue du bundle (Q78)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('français : labelFr ; le code si l’API ne donne aucun libellé', async () => {
    expect(await labels('fr')).toEqual({ anxiety: 'Anxiété', joy: 'Joie', unnamed: 'unnamed' });
  });

  it('anglais : labelEn s’il existe, sinon le français', async () => {
    expect(await labels('en')).toEqual({ anxiety: 'Anxiety', joy: 'Joie', unnamed: 'unnamed' });
  });

  it('arabe : labelAr s’il existe, sinon le français', async () => {
    expect(await labels('ar')).toEqual({ anxiety: 'قلق', joy: 'Joie', unnamed: 'unnamed' });
  });
});
