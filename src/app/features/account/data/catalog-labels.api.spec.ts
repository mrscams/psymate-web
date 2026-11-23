import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { catalogLabel } from '../../../core/i18n';
import { EmotionsApi } from './emotions.api';
import { ProfileApi } from './profile.api';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
  });
  return { http: TestBed.inject(HttpTestingController) };
}

/** M16-25 : libellés arabes des catalogues (contrat 0.16.0) portés du DTO au modèle. */
describe('account · libellés arabes des catalogues (M16-25)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('GET /api/vocabulary/emotions : labelAr porté, null s’il manque (personnalisée, globale sans)', async () => {
    const { http } = setup();
    const pending = TestBed.inject(EmotionsApi).list();
    http.expectOne('/api/vocabulary/emotions').flush([
      {
        code: 'anxiety',
        scope: 'global',
        family: 'fear',
        labelFr: 'Anxiété',
        labelEn: 'Anxiety',
        labelAr: 'قلق',
      },
      { code: 'joy', scope: 'global', family: 'joy', labelFr: 'Joie', labelEn: 'Joy' },
      { code: 'c_1', scope: 'custom', family: 'sadness', labelFr: 'Lassitude' },
    ]);
    const list = await pending;
    expect(list.map((e) => e.labelAr)).toEqual(['قلق', null, null]);
    expect(list.map((e) => catalogLabel(e, 'ar'))).toEqual(['قلق', 'Joie', 'Lassitude']);
    expect(list.map((e) => catalogLabel(e, 'fr'))).toEqual(['Anxiété', 'Joie', 'Lassitude']);
    expect(list.map((e) => catalogLabel(e, 'en'))).toEqual(['Anxiety', 'Joy', 'Lassitude']);
  });

  it('GET /api/vocabulary/directory : labelAr porté ; en arabe, le français s’il est vide ou absent', async () => {
    const { http } = setup();
    const pending = TestBed.inject(ProfileApi).vocabulary();
    http.expectOne('/api/vocabulary/directory').flush({
      specialties: [
        { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'القلق' },
        { code: 'grief', labelFr: 'Deuil', labelEn: 'Grief', labelAr: '' },
        { code: 'cbt', labelFr: 'TCC' },
      ],
      audiences: [],
      modalities: [],
      languages: [],
    });
    const { specialties } = await pending;
    expect(specialties.map((item) => item.labelAr)).toEqual(['القلق', '', null]);
    expect(specialties.map((item) => catalogLabel(item, 'ar'))).toEqual(['القلق', 'Deuil', 'TCC']);
    expect(specialties.map((item) => catalogLabel(item, 'fr'))).toEqual([
      'Anxiété',
      'Deuil',
      'TCC',
    ]);
    expect(specialties.map((item) => catalogLabel(item, 'en'))).toEqual([
      'Anxiety',
      'Grief',
      'TCC',
    ]);
  });
});
