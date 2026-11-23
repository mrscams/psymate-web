import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { vocabularyLabel } from '../ui/labels';
import { DirectoryApi } from './directory.api';

/** M16-25 : libellés arabes de l'annuaire (contrat 0.16.0) portés du DTO au modèle. */
describe('DirectoryApi · libellés arabes du vocabulaire (M16-25)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('labelAr porté ; en arabe, l’arabe s’il existe, sinon le français ; fr et en inchangés', async () => {
    TestBed.configureTestingModule({
      // Client généré sans configuration (public ne lit pas core/auth) : seule la fin de l'URL compte.
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const pending = TestBed.inject(DirectoryApi).vocabulary();
    http
      .expectOne((r) => r.url.endsWith('/api/public/directory/vocabulary'))
      .flush({
        specialties: [
          { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'القلق' },
          { code: 'grief', labelFr: 'Deuil', labelEn: 'Grief', labelAr: '' },
          { code: 'cbt', labelFr: 'TCC' },
        ],
        audiences: [],
        modalities: [],
        languages: [],
      });
    const vocabulary = await pending;
    expect(vocabulary.specialties.map((item) => item.labelAr)).toEqual(['القلق', '', null]);
    const label = (code: string, locale: 'fr' | 'en' | 'ar') =>
      vocabularyLabel(vocabulary, 'specialties', code, locale);
    expect(['anxiety', 'grief', 'cbt'].map((code) => label(code, 'ar'))).toEqual([
      'القلق',
      'Deuil',
      'TCC',
    ]);
    expect(['anxiety', 'grief', 'cbt'].map((code) => label(code, 'fr'))).toEqual([
      'Anxiété',
      'Deuil',
      'TCC',
    ]);
    expect(['anxiety', 'grief', 'cbt'].map((code) => label(code, 'en'))).toEqual([
      'Anxiety',
      'Grief',
      'TCC',
    ]);
  });
});
