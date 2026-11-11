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

describe('PatientShellApi.firstSessionMonth (borne du « suivi·e depuis », UX-G2c)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it.each([
    ['aucune période', [], null],
    ['pas de séance', [{ period: '2003-07', counts: { event: 2 } }], null],
    [
      'la plus ancienne période avec une séance',
      [
        { period: '2003-07', counts: { event: 2 } },
        { period: '2023-11', counts: { event: 1, session: 1 } },
        { period: '2023-12', counts: { session: 2 } },
      ],
      '2023-11',
    ],
    ['compteur à zéro', [{ period: '2024-01', counts: { session: 0 } }], null],
    [
      'libellé absent : début de période',
      [{ from: '2024-02-01T00:00:00Z', counts: { session: 1 } }],
      '2024-02',
    ],
  ])(
    'résumé par mois, sans fenêtre, privées comprises : %s → %s',
    async (_label, periods, expected) => {
      const { api, http } = setup();
      const pending = api.firstSessionMonth('p-1');
      const req = http.expectOne(
        (r) => r.url === '/api/patients/p-1/timeline/summary' && r.method === 'GET',
      );
      expect(req.request.params.get('granularity')).toBe('month');
      expect(req.request.params.get('includePrivate')).toBe('true');
      expect(req.request.params.has('from')).toBe(false);
      expect(req.request.params.has('to')).toBe(false);
      req.flush({ granularity: 'month', periods });
      await expect(pending).resolves.toBe(expected);
    },
  );
});
