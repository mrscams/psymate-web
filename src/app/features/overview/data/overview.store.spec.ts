import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PatientShellStore } from '../../patient-shell';
import { OverviewApi } from './overview.api';
import { emptyOverview, overviewView } from './overview.fixtures';
import { OverviewStore } from './overview.store';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(overview = vi.fn().mockResolvedValue(overviewView())) {
  const revision = signal(0);
  TestBed.configureTestingModule({
    providers: [
      OverviewStore,
      { provide: OverviewApi, useValue: { overview } },
      { provide: PatientShellStore, useValue: { revision } },
    ],
  });
  return { store: TestBed.inject(OverviewStore), overview, revision };
}

describe('OverviewStore', () => {
  it('load : GET …/overview?window= du patient, synthèse lue', async () => {
    const { store, overview } = setup();
    await store.load('p-1', '90d');
    expect(overview).toHaveBeenCalledWith('p-1', '90d');
    expect(store.overview().status).toBe('loaded');
    expect(store.view()?.facts.sessionCount).toBe(31);
    expect(store.window()).toBe('90d');
  });

  it('dossier sans séance passée (UX-S6) : la synthèse est servie telle quelle, sans séance de référence', async () => {
    const { store } = setup(vi.fn().mockResolvedValue(emptyOverview()));
    await store.load('p-1', '90d');
    expect(store.overview().status).toBe('loaded');
    expect(store.view()?.sinceLastSession).toEqual({
      lastSessionId: null,
      lastSessionAt: null,
      entries: [],
    });
    expect(store.refreshing()).toBe(false);
  });

  it('même patient et même fenêtre : aucune nouvelle requête', async () => {
    const { store, overview } = setup();
    await store.load('p-1', '90d');
    await store.load('p-1', '90d');
    expect(overview).toHaveBeenCalledTimes(1);
  });

  it('changement de fenêtre : relu par l’API (?window=30d), la synthèse précédente reste affichée', async () => {
    const next = deferred<ReturnType<typeof overviewView>>();
    const overview = vi
      .fn()
      .mockResolvedValueOnce(overviewView())
      .mockReturnValueOnce(next.promise);
    const { store } = setup(overview);
    await store.load('p-1', '90d');
    const pending = store.load('p-1', '30d');
    expect(overview).toHaveBeenLastCalledWith('p-1', '30d');
    expect(store.refreshing()).toBe(true);
    expect(store.view()?.window).toBe('90d');
    next.resolve(overviewView({ window: '30d' }));
    await pending;
    expect(store.refreshing()).toBe(false);
    expect(store.view()?.window).toBe('30d');
  });

  it('autre patient : l’affichage repart de zéro', async () => {
    const next = deferred<ReturnType<typeof overviewView>>();
    const overview = vi
      .fn()
      .mockResolvedValueOnce(overviewView())
      .mockReturnValueOnce(next.promise);
    const { store } = setup(overview);
    await store.load('p-1', '90d');
    void store.load('p-2', '90d');
    expect(store.view()).toBeNull();
    expect(store.overview().status).toBe('loading');
    next.resolve(emptyOverview());
    await flush();
    expect(store.patientId()).toBe('p-2');
  });

  it('relecture après écriture : l’événement du shell (revision) relit la synthèse', async () => {
    const { store, overview, revision } = setup();
    await store.load('p-1', '30d');
    TestBed.tick();
    expect(overview).toHaveBeenCalledTimes(1);
    revision.set(1);
    TestBed.tick();
    await flush();
    expect(overview).toHaveBeenCalledTimes(2);
    expect(overview).toHaveBeenLastCalledWith('p-1', '30d');
    // Sans nouvelle écriture, rien ne se relit.
    TestBed.tick();
    expect(overview).toHaveBeenCalledTimes(2);
  });

  it('écriture avant tout chargement : rien à relire', async () => {
    const { overview, revision } = setup();
    TestBed.tick();
    revision.set(3);
    TestBed.tick();
    await flush();
    expect(overview).not.toHaveBeenCalled();
  });

  it('erreur : ApiProblem dans le bloc, la synthèse précédente reste ; Réessayer relit', async () => {
    const overview = vi
      .fn()
      .mockResolvedValueOnce(overviewView())
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(overviewView({ sourceRev: 43 }));
    const { store } = setup(overview);
    await store.load('p-1', '90d');
    await store.refresh();
    expect(store.overview().status).toBe('error');
    expect(store.overview().problem?.code).toBe('INTERNAL_ERROR');
    expect(store.view()?.sourceRev).toBe(42);
    await store.refresh();
    expect(store.overview().status).toBe('loaded');
    expect(store.view()?.sourceRev).toBe(43);
  });

  it('erreur au premier chargement : aucune donnée, statut error', async () => {
    const { store } = setup(vi.fn().mockRejectedValue({ status: 404, code: 'PATIENT_NOT_FOUND' }));
    await store.load('p-1', '90d');
    expect(store.overview().status).toBe('error');
    expect(store.view()).toBeNull();
  });

  it('réponses dans le désordre : seule la dernière demande compte', async () => {
    const slow = deferred<ReturnType<typeof overviewView>>();
    const overview = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(overviewView({ window: '12m' }));
    const { store } = setup(overview);
    void store.load('p-1', '90d');
    await store.load('p-1', '12m');
    slow.resolve(overviewView({ window: '90d' }));
    await flush();
    expect(store.view()?.window).toBe('12m');
  });

  it('refresh : relit la synthèse courante (même patient, même fenêtre)', async () => {
    const overview = vi
      .fn()
      .mockResolvedValueOnce(overviewView({ computedAt: '2026-11-08T10:00:00Z' }))
      .mockResolvedValueOnce(overviewView({ computedAt: '2026-11-08T10:20:00Z' }));
    const { store } = setup(overview);
    await store.load('p-1', '12m');
    await store.refresh();
    expect(overview).toHaveBeenNthCalledWith(2, 'p-1', '12m');
    expect(store.view()?.computedAt).toBe('2026-11-08T10:20:00Z');
  });
});
