import { TestBed } from '@angular/core/testing';

import { AgendaApi } from './agenda.api';
import { demoAgenda } from './agenda.fixtures';
import { AgendaData, AgendaRange, fromIsoDay } from './agenda.model';
import { AgendaStore } from './agenda.store';

const d = (iso: string) => fromIsoDay(iso)!;

function setup(api: Partial<AgendaApi> = {}) {
  const load = vi.fn((range: AgendaRange) => Promise.resolve(demoAgenda(range)));
  TestBed.configureTestingModule({
    providers: [
      AgendaStore,
      {
        provide: AgendaApi,
        useValue: {
          load,
          syncStatus: vi.fn().mockResolvedValue({ state: 'ok', minutesAgo: 2 }),
          ...api,
        },
      },
    ],
  });
  return { store: TestBed.inject(AgendaStore), load };
}

describe('AgendaStore', () => {
  it('show : lit la plage de la vue, puis l’état de synchronisation ; même plage → pas de relecture', async () => {
    const { store, load } = setup();
    expect(store.data().status).toBe('idle');
    await store.show('week', d('2026-10-28'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].from.getDate()).toBe(26);
    expect(store.data().status).toBe('loaded');
    expect(store.appointments()).toHaveLength(14);
    expect(store.busy()).toHaveLength(3);
    expect(store.sessionCount()).toBe(14);
    await Promise.resolve();
    expect(store.sync()).toEqual({ state: 'ok', minutesAgo: 2 });

    // Un autre jour de la même semaine : la plage ne change pas, rien n'est relu.
    await store.show('week', d('2026-10-30'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.date()).toBe('2026-10-30');
    // La semaine suivante : relecture, la donnée précédente reste pendant le chargement.
    await store.show('week', d('2026-11-04'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.range().from.getDate()).toBe(2);
    // Changer de vue change la plage.
    await store.show('day', d('2026-11-04'));
    expect(load).toHaveBeenCalledTimes(3);
    expect(store.appointments().map((a) => a.patient.displayName)).toEqual(['Adam D.', 'Paul L.']);
  });

  it('une réponse arrivée après un changement de plage est ignorée', async () => {
    let resolveFirst!: (data: AgendaData) => void;
    const first = new Promise<AgendaData>((resolve) => (resolveFirst = resolve));
    const load = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockImplementation((range: AgendaRange) => Promise.resolve(demoAgenda(range)));
    const { store } = setup({ load });
    const pending = store.show('week', d('2026-10-26'));
    await store.show('day', d('2026-10-31'));
    expect(store.appointments()).toHaveLength(2);
    resolveFirst({ appointments: [], busy: [] });
    await pending;
    expect(store.appointments()).toHaveLength(2);
    expect(store.data().status).toBe('loaded');
  });

  it('erreur de lecture sur une autre plage : état error avec le problème, sans la donnée de l’ancienne plage ; reload relit', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(demoAgenda({ from: d('2026-10-26'), to: d('2026-11-02') }))
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce({ appointments: [], busy: [] });
    const { store } = setup({ load });
    await store.show('week', d('2026-10-26'));
    await store.show('week', d('2026-11-02'));
    expect(store.data().status).toBe('error');
    expect(store.data().problem).not.toBeNull();
    expect(store.appointments()).toHaveLength(0);
    expect(store.sessionCount()).toBe(0);
    await store.reload();
    expect(store.data().status).toBe('loaded');
    expect(store.appointments()).toHaveLength(0);
  });

  it('cases du rail : masquer les visios retire leurs rendez-vous, masquer Google Pro ses blocs', async () => {
    const { store } = setup();
    await store.show('week', d('2026-10-26'));
    store.toggleCalendar('video');
    expect(store.isVisible('video')).toBe(false);
    expect(store.appointments().some((a) => a.modality === 'video')).toBe(false);
    expect(store.sessionCount()).toBe(11);
    store.toggleCalendar('google-pro');
    expect(store.busy().map((b) => b.calendar)).toEqual(['perso']);
    store.toggleCalendar('video');
    expect(store.sessionCount()).toBe(14);
  });

  it('sélection : le rendez-vous ouvert et ses voisins du jour, dans l’ordre de la grille', async () => {
    const { store } = setup();
    await store.show('week', d('2026-10-26'));
    expect(store.selected()).toBeNull();
    store.select('rdv-2026-10-31-13');
    expect(store.selected()?.patient.displayName).toBe('Marie D.');
    expect(store.selectedDaySiblings().map((a) => a.id)).toEqual([
      'rdv-2026-10-31-13',
      'rdv-2026-10-31-14',
    ]);
    store.select('inconnu');
    expect(store.selected()).toBeNull();
    expect(store.selectedDaySiblings()).toEqual([]);
  });

  it('stepped : la date suivante selon la vue, sans changer l’état', async () => {
    const { store } = setup();
    await store.show('month', d('2026-10-26'));
    expect(store.stepped(1).getMonth()).toBe(10);
    expect(store.stepped(-1).getMonth()).toBe(8);
    expect(store.date()).toBe('2026-10-26');
  });
});
