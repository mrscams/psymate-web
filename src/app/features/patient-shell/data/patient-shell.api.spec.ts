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

describe('PatientShellApi, onglet Séance (UX-S3)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sessionEntries : la chronologie sans fenêtre, filtrée ici sur la séance, de la plus récemment enregistrée à la plus ancienne', async () => {
    const { api, http } = setup();
    const pending = api.sessionEntries('p-1', 's-open');
    const req = http.expectOne((r) => r.url === '/api/patients/p-1/timeline' && r.method === 'GET');
    expect(req.request.params.get('limit')).toBe('200');
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.has('types')).toBe(false);
    req.flush({
      items: [
        { id: 'e-1', type: 'note', sessionId: 's-open', recordedAt: '2026-10-24T14:12:00Z' },
        { id: 'e-2', type: 'feeling', sessionId: 's-other', recordedAt: '2026-10-24T14:13:00Z' },
        {
          id: 'e-3',
          type: 'feeling',
          sessionId: 's-open',
          recordedAt: '2026-10-24T14:20:00Z',
          emotion: { code: 'anxiety', family: 'fear' },
          intensity: 7,
          linkCount: 1,
        },
        { id: 's-open', type: 'session', sessionId: null, recordedAt: '2026-10-24T14:00:00Z' },
      ],
      nextCursor: null,
    });
    const entries = await pending;
    expect(entries.map((e) => e.id)).toEqual(['e-3', 'e-1']);
    expect(entries[0]).toMatchObject({ emotionCode: 'anxiety', intensity: 7, linkCount: 1 });
  });

  it('sessionEntries : suit le curseur, trois fenêtres au plus', async () => {
    const { api, http } = setup();
    const pending = api.sessionEntries('p-1', 's-open');
    for (let page = 0; page < 3; page++) {
      const req = http.expectOne((r) => r.url === '/api/patients/p-1/timeline');
      expect(req.request.params.get('cursor')).toBe(page === 0 ? null : `c${page}`);
      req.flush({
        items: [{ id: `e-${page}`, type: 'note', sessionId: 's-open' }],
        nextCursor: `c${page + 1}`,
      });
      await Promise.resolve();
    }
    expect((await pending).map((e) => e.id)).toHaveLength(3);
  });

  it('linkSentence : la phrase du premier lien et le nombre de liens ; null sans lien', async () => {
    const { api, http } = setup();
    const pending = api.linkSentence('e-3');
    http.expectOne('/api/entries/e-3/links').flush([
      { id: 'l-1', sentence: 'Anxiété déclenchée par Réorg' },
      { id: 'l-2', sentence: 'x' },
    ]);
    await expect(pending).resolves.toEqual({ sentence: 'Anxiété déclenchée par Réorg', count: 2 });
    const none = api.linkSentence('e-1');
    http.expectOne('/api/entries/e-1/links').flush([]);
    await expect(none).resolves.toBeNull();
  });

  it('previousSession : la première séance ordinaire clôturée autre que la courante (accueil et contact ignorés)', async () => {
    const { api, http } = setup();
    const pending = api.previousSession('p-1', 's-open');
    const list = http.expectOne((r) => r.url === '/api/patients/p-1/timeline');
    expect(list.request.params.getAll('types')).toEqual(['session']);
    expect(list.request.params.get('limit')).toBe('10');
    list.flush({
      items: [
        { id: 's-open', type: 'session', occurred: { from: '2026-11-12T09:08:00Z' } },
        { id: 's-intake', type: 'session', occurred: { from: '2026-11-12T08:00:00Z' } },
        { id: 's-prev', type: 'session', occurred: { from: '2026-11-05T09:00:00Z' } },
      ],
      nextCursor: null,
    });
    await Promise.resolve();
    http.expectOne('/api/entries/s-intake').flush({
      id: 's-intake',
      type: 'session',
      session: { kind: 'intake', closedAt: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/entries/s-prev').flush({
      id: 's-prev',
      type: 'session',
      body: 'Reprise.\n\nProchaine fois :\n– Relire',
      occurred: { from: '2026-11-05T09:00:00Z' },
      session: {
        kind: 'session',
        closedAt: '2026-11-05T09:50:00Z',
        durationMin: 50,
        modality: 'in_person',
      },
    });
    await expect(pending).resolves.toEqual({
      id: 's-prev',
      kind: 'session',
      startedAt: '2026-11-05T09:00:00Z',
      durationMin: 50,
      modality: 'in_person',
      summary: 'Reprise.\n\nProchaine fois :\n– Relire',
    });
  });

  it('previousSession : null quand il n’y a que la courante et l’accueil', async () => {
    const { api, http } = setup();
    const pending = api.previousSession('p-1', 's-open');
    http
      .expectOne((r) => r.url === '/api/patients/p-1/timeline')
      .flush({
        items: [
          { id: 's-open', type: 'session' },
          { id: 's-intake', type: 'session' },
        ],
      });
    await Promise.resolve();
    http
      .expectOne('/api/entries/s-intake')
      .flush({ id: 's-intake', type: 'session', session: { kind: 'intake' } });
    await expect(pending).resolves.toBeNull();
  });

  it('reminders : drapeaux, médicaments, situations et « depuis la séance » de la vue d’ensemble (90 j)', async () => {
    const { api, http } = setup();
    const pending = api.reminders('p-1');
    const req = http.expectOne((r) => r.url === '/api/patients/p-1/overview');
    expect(req.request.params.get('window')).toBe('90d');
    req.flush({
      facts: {
        flags: [{ kind: 'watch', reason: 'sommeil' }, { kind: 'autre' }],
        activeMedications: [
          { entryId: 'm-1', molecule: 'Mélatonine', dosage: '2 mg', periodFrom: '2026-10-15' },
        ],
      },
      activeSituations: [{ entryId: 'sit-1', title: 'Réorg' }],
      sinceLastSession: {
        lastSessionAt: '2026-11-05T09:00:00Z',
        entries: [{ entryId: 'f-1', type: 'feeling', occurredFrom: '2026-11-08' }],
      },
    });
    await expect(pending).resolves.toEqual({
      flags: [{ kind: 'watch', reason: 'sommeil' }],
      medications: [
        { entryId: 'm-1', molecule: 'Mélatonine', dosage: '2 mg', since: '2026-10-15' },
      ],
      situations: [{ entryId: 'sit-1', title: 'Réorg', since: null }],
      since: {
        lastSessionAt: '2026-11-05T09:00:00Z',
        entries: [{ entryId: 'f-1', type: 'feeling', title: null, occurredFrom: '2026-11-08' }],
      },
    });
  });
});
