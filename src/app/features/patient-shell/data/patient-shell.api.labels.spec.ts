import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { PatientShellApi } from './patient-shell.api';

/** M16-25 : libellés arabes du vocabulaire des émotions (contrat 0.16.0), choisis par catalogLabel. */
describe('PatientShellApi.emotionLabels : libellé arabe (M16-25)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  async function labels(locale: string): Promise<Record<string, string>> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: LOCALE_ID, useValue: locale },
      ],
    });
    const pending = TestBed.inject(PatientShellApi).emotionLabels();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url === '/api/vocabulary/emotions' && r.method === 'GET')
      .flush([
        { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'قلق' },
        { code: 'joy', labelFr: 'Joie', labelEn: 'Joy', labelAr: '' },
        { code: 'shame', labelFr: 'Honte', labelEn: 'Shame' },
      ]);
    return pending;
  }

  it('arabe : labelAr s’il existe ; vide ou absent, le français', async () => {
    expect(await labels('ar')).toEqual({ anxiety: 'قلق', joy: 'Joie', shame: 'Honte' });
  });

  it('français et anglais inchangés par la présence d’un libellé arabe', async () => {
    expect(await labels('fr')).toEqual({ anxiety: 'Anxiété', joy: 'Joie', shame: 'Honte' });
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    expect(await labels('en')).toEqual({ anxiety: 'Anxiety', joy: 'Joy', shame: 'Shame' });
  });
});
