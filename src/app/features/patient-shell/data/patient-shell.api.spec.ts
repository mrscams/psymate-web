import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { PatientShellApi } from './patient-shell.api';

// Le client généré n'est importé que par patient-shell.api.ts : ici, on observe les requêtes HTTP.
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
  });
  return { api: TestBed.inject(PatientShellApi), http: TestBed.inject(HttpTestingController) };
}

describe('PatientShellApi.hasEntries (indice de première entrée, M7-03)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it.each([
    ['aucune période', [], false],
    ['la séance d’accueil seule', [{ counts: { session: 1 } }], false],
    ['une note dans l’accueil', [{ counts: { session: 1, note: 1 } }], true],
    ['un ressenti une autre année', [{ counts: { session: 2 } }, { counts: { feeling: 3 } }], true],
    ['compteur à zéro', [{ counts: { note: 0 } }], false],
  ])(
    'résumé de la chronologie par année, privées comprises : %s → %s',
    async (_label, periods, expected) => {
      const { api, http } = setup();
      const pending = api.hasEntries('p-1');
      const req = http.expectOne(
        (r) => r.url === '/api/patients/p-1/timeline/summary' && r.method === 'GET',
      );
      expect(req.request.params.get('granularity')).toBe('year');
      expect(req.request.params.get('includePrivate')).toBe('true');
      req.flush({ granularity: 'year', periods });
      await expect(pending).resolves.toBe(expected);
    },
  );
});
