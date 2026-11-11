import { TestBed } from '@angular/core/testing';

import { PatientApi } from './patient.api';
import { patient, VERSIONS } from './patient.fixtures';
import { PatientChanges } from './patient.model';
import { PatientStore } from './patient.store';

function setup(api: Partial<PatientApi>) {
  TestBed.configureTestingModule({
    providers: [PatientStore, { provide: PatientApi, useValue: api }],
  });
  return TestBed.inject(PatientStore);
}

const NO_CHANGE: PatientChanges = { patch: null, flagsToClear: [], flagsToSet: [], tags: null };
const problem422 = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [{ field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' }],
};

describe('PatientStore', () => {
  it('load : fiche puis historique ; erreur → état erreur sans historique', async () => {
    const ok = setup({
      get: vi.fn().mockResolvedValue(patient()),
      versions: vi.fn().mockResolvedValue(VERSIONS),
    });
    const pending = ok.load('p-marie');
    expect(ok.patient().status).toBe('loading');
    await pending;
    expect(ok.current()?.displayName).toBe('Marie D.');
    expect(ok.history().map((d) => d.version)).toEqual([3, 2]);

    TestBed.resetTestingModule();
    const versions = vi.fn();
    const ko = setup({
      get: vi.fn().mockRejectedValue({ status: 403, code: 'PATIENT_FORBIDDEN' }),
      versions,
    });
    await ko.load('p-x');
    expect(ko.patient().status).toBe('error');
    expect(ko.patient().problem?.code).toBe('PATIENT_FORBIDDEN');
    expect(versions).not.toHaveBeenCalled();
  });

  it('load : nombre de séances lu dans la projection ; illisible → null, sans erreur de la fiche', async () => {
    const sessionCount = vi.fn().mockResolvedValue(31);
    const ok = setup({
      get: vi.fn().mockResolvedValue(patient()),
      versions: vi.fn().mockResolvedValue([]),
      sessionCount,
    });
    await ok.load('p-marie');
    expect(sessionCount).toHaveBeenCalledWith('p-marie');
    expect(ok.sessionCount()).toBe(31);

    TestBed.resetTestingModule();
    const ko = setup({
      get: vi.fn().mockResolvedValue(patient()),
      versions: vi.fn().mockResolvedValue([]),
      sessionCount: vi.fn().mockRejectedValue({ status: 503 }),
    });
    await ko.load('p-marie');
    expect(ko.sessionCount()).toBeNull();
    expect(ko.patient().status).toBe('loaded');
  });

  it.each([
    ['201 → la fiche créée', vi.fn().mockResolvedValue(patient()), 'idle', 'Marie D.'],
    ['422 → problème gardé pour les champs', vi.fn().mockRejectedValue(problem422), 'error', null],
  ])('create %s', async (_label, create, status, name) => {
    const store = setup({ create });
    const result = await store.create({ displayName: 'Marie D.' });
    expect(result?.displayName ?? null).toBe(name);
    expect(store.saveStatus()).toBe(status);
    if (status === 'error') expect(store.saveProblem()?.errors?.[0].field).toBe('displayName');
  });

  describe('update', () => {
    async function loaded(api: Partial<PatientApi>) {
      const store = setup({
        get: vi.fn().mockResolvedValue(patient()),
        versions: vi.fn().mockResolvedValue([]),
        ...api,
      });
      await store.load('p-marie');
      return store;
    }

    it('dans l’ordre PATCH, drapeaux levés, posés, tags ; historique relu après le PATCH', async () => {
      const calls: string[] = [];
      const record = (name: string, result = patient()) =>
        vi.fn(async () => {
          calls.push(name);
          return result;
        });
      const versions = vi.fn().mockResolvedValue([]);
      const store = await loaded({
        versions,
        patch: record('patch', patient({ currentVersion: 2 })),
        clearFlag: record('clear'),
        addFlag: record('add'),
        replaceTags: record('tags', patient({ currentVersion: 2, tags: [] })),
      });
      const ok = await store.update({
        patch: { followUp: { rhythm: 'monthly' } },
        flagsToClear: ['watch'],
        flagsToSet: [{ kind: 'watch', reason: 'Isolement' }],
        tags: [],
      });
      expect(ok).toBe(true);
      expect(calls).toEqual(['patch', 'clear', 'add', 'tags']);
      expect(store.current()?.currentVersion).toBe(2);
      expect(store.current()?.tags).toEqual([]);
      expect(versions).toHaveBeenCalledTimes(2);
    });

    it('sans PATCH : pas de relecture de l’historique', async () => {
      const versions = vi.fn().mockResolvedValue([]);
      const store = await loaded({ versions, replaceTags: vi.fn().mockResolvedValue(patient()) });
      await store.update({ ...NO_CHANGE, tags: ['travail'] });
      expect(versions).toHaveBeenCalledTimes(1);
    });

    it('422 sur le PATCH : rien d’autre n’est envoyé, problème gardé', async () => {
      const addFlag = vi.fn();
      const store = await loaded({ patch: vi.fn().mockRejectedValue(problem422), addFlag });
      const ok = await store.update({
        ...NO_CHANGE,
        patch: { displayName: null },
        flagsToSet: [{ kind: 'risk' }],
      });
      expect(ok).toBe(false);
      expect(addFlag).not.toHaveBeenCalled();
      expect(store.saveStatus()).toBe('error');
      expect(store.saveProblem()?.code).toBe('VALIDATION_FAILED');
    });

    it('erreur après un PATCH réussi : la fiche enregistrée reste affichée', async () => {
      const store = await loaded({
        patch: vi.fn().mockResolvedValue(patient({ currentVersion: 2 })),
        addFlag: vi.fn().mockRejectedValue({ status: 409, code: 'FLAG_ALREADY_ACTIVE' }),
      });
      const ok = await store.update({
        ...NO_CHANGE,
        patch: { firstName: 'Mary' },
        flagsToSet: [{ kind: 'risk' }],
      });
      expect(ok).toBe(false);
      expect(store.current()?.currentVersion).toBe(2);
      expect(store.saveProblem()?.code).toBe('FLAG_ALREADY_ACTIVE');
    });
  });

  it.each([
    ['archive 204', 'archive', vi.fn().mockResolvedValue(undefined), true, 'idle'],
    [
      'archive 403',
      'archive',
      vi.fn().mockRejectedValue({ status: 403, code: 'X' }),
      false,
      'error',
    ],
    ['restore 200', 'restore', vi.fn().mockResolvedValue(patient()), true, 'idle'],
    [
      'restore 404',
      'restore',
      vi.fn().mockRejectedValue({ status: 404, code: 'X' }),
      false,
      'error',
    ],
  ] as const)('%s', async (_label, method, call, expected, status) => {
    const store = setup({
      get: vi.fn().mockResolvedValue(patient({ archivedAt: '2026-11-05T10:00:00Z' })),
      versions: vi.fn().mockResolvedValue([]),
      [method]: call,
    });
    await store.load('p-marie');
    expect(store.archived()).toBe(true);
    await expect(store[method]()).resolves.toBe(expected);
    expect(store.archiveStatus()).toBe(status);
    if (method === 'restore' && expected) expect(store.archived()).toBe(false);
  });

  it('load d’un autre dossier : rien du précédent ne reste pendant le chargement', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(patient())
      .mockImplementationOnce(() => new Promise(() => undefined));
    const store = setup({ get, versions: vi.fn().mockResolvedValue(VERSIONS) });
    await store.load('p-marie');
    void store.load('p-omar');
    expect(store.current()).toBeNull();
    expect(store.history()).toEqual([]);
  });
});
