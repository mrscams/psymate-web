import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../core/http';
import { appointmentOf, weekAgenda } from '../testing/agenda.testing';
import { AgendaApi } from './agenda.api';
import { AgendaData, AgendaRange, fromIsoDay } from './agenda.model';
import { AgendaStore } from './agenda.store';

const d = (iso: string) => fromIsoDay(iso)!;

const problem = (status: number, code: string, detail?: string): ApiProblem => ({
  status,
  code,
  detail,
});

function setup(api: Partial<Record<keyof AgendaApi, ReturnType<typeof vi.fn>>> = {}) {
  const load = vi.fn((range: AgendaRange) => Promise.resolve(weekAgenda(range)));
  const mock = {
    load,
    get: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    cancelSeries: vi.fn(),
    preparation: vi.fn().mockResolvedValue({
      lastSessionAt: '2026-10-24T08:00:00Z',
      feelings: 2,
      events: 1,
      others: 0,
      followedSince: '2025-03-01',
    }),
    patientAppointments: vi.fn().mockResolvedValue({
      appointments: [],
      defaults: { durationMin: 50, modality: 'in_person', rhythm: 'toutes les 2 semaines' },
    }),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [AgendaStore, { provide: AgendaApi, useValue: mock }],
  });
  return { store: TestBed.inject(AgendaStore), load, api: mock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('AgendaStore', () => {
  it('show : lit la plage de la vue ; même plage → pas de relecture ; autre plage → relecture', async () => {
    const { store, load } = setup();
    expect(store.data().status).toBe('idle');
    await store.show('week', d('2026-10-28'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].from.getDate()).toBe(26);
    expect(store.data().status).toBe('loaded');
    expect(store.appointments()).toHaveLength(14);
    expect(store.sessionCount()).toBe(14);

    await store.show('week', d('2026-10-30'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.date()).toBe('2026-10-30');
    await store.show('week', d('2026-11-04'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.range().from.getDate()).toBe(2);
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
      .mockImplementation((range: AgendaRange) => Promise.resolve(weekAgenda(range)));
    const { store } = setup({ load });
    const pending = store.show('week', d('2026-10-26'));
    await store.show('day', d('2026-10-31'));
    expect(store.appointments()).toHaveLength(2);
    resolveFirst({ appointments: [], busy: [] });
    await pending;
    expect(store.appointments()).toHaveLength(2);
    expect(store.data().status).toBe('loaded');
  });

  it('erreur de lecture sur une autre plage : état error sans l’ancienne donnée ; reload relit', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(weekAgenda({ from: d('2026-10-26'), to: d('2026-11-02') }))
      .mockRejectedValueOnce(problem(0, 'NETWORK_ERROR'))
      .mockResolvedValueOnce({ appointments: [], busy: [] });
    const { store } = setup({ load });
    await store.show('week', d('2026-10-26'));
    await store.show('week', d('2026-11-02'));
    expect(store.data().status).toBe('error');
    expect(store.data().problem?.code).toBe('NETWORK_ERROR');
    expect(store.appointments()).toHaveLength(0);
    await store.reload();
    expect(store.data().status).toBe('loaded');
  });

  it('cases du rail : masquer les visios retire leurs rendez-vous et ferme leur détail', async () => {
    const { store } = setup();
    await store.show('week', d('2026-10-26'));
    store.select('rdv-2026-10-26-2');
    expect(store.selected()?.patient.displayName).toBe('Léa T.');
    store.toggleCalendar('video');
    expect(store.isVisible('video')).toBe(false);
    expect(store.appointments().some((a) => a.modality === 'video')).toBe(false);
    expect(store.sessionCount()).toBe(11);
    expect(store.selected()).toBeNull();
    expect(store.detailState()).toBe('none');
    store.toggleCalendar('video');
    expect(store.sessionCount()).toBe(14);
  });

  it('sélection dans la plage : le rendez-vous et ses voisins du jour, sans lecture à part', async () => {
    const { store, api } = setup();
    await store.show('week', d('2026-10-26'));
    store.select('rdv-2026-10-31-13');
    expect(store.selected()?.patient.displayName).toBe('Marie D.');
    expect(store.detailState()).toBe('ready');
    expect(store.selectedDaySiblings().map((a) => a.id)).toEqual([
      'rdv-2026-10-31-13',
      'rdv-2026-10-31-14',
    ]);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('lien direct hors de la plage : GET /api/appointments/{id} ; 404 → introuvable', async () => {
    const other = appointmentOf({ id: 'ailleurs', startsAt: '2026-12-01T09:00:00Z' });
    const get = vi
      .fn()
      .mockResolvedValueOnce(other)
      .mockRejectedValueOnce(problem(404, 'APPOINTMENT_NOT_FOUND'));
    const { store } = setup({ get });
    store.select('ailleurs');
    expect(store.detailState()).toBe('loading');
    await store.show('week', d('2026-10-26'));
    await flush();
    expect(get).toHaveBeenCalledWith('ailleurs');
    expect(store.selected()?.id).toBe('ailleurs');
    expect(store.detailState()).toBe('ready');

    store.select('inconnu');
    await flush();
    expect(store.selected()).toBeNull();
    expect(store.detailState()).toBe('missing');
  });

  it('déplacer : PATCH, puis relecture de la plage ; les chevauchements sont rendus', async () => {
    const conflict = {
      appointmentId: 'x',
      patientDisplayName: 'Théo B.',
      startsAt: '2026-10-31T10:30:00Z',
      endsAt: '2026-10-31T11:20:00Z',
      occurrenceStartsAt: '2026-10-31T10:00:00Z',
    };
    const update = vi.fn().mockResolvedValue({
      appointment: appointmentOf({ startsAt: '2026-10-31T10:00:00Z' }),
      conflicts: [conflict],
    });
    const { store, load } = setup({ update });
    await store.show('week', d('2026-10-26'));
    const result = await store.move('rdv-2026-10-26-1', '2026-10-26T09:00:00.000Z', 80);
    expect(update).toHaveBeenCalledWith('rdv-2026-10-26-1', {
      startsAt: '2026-10-26T09:00:00.000Z',
      durationMin: 80,
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, conflicts: [conflict] });
  });

  it('écriture refusée (409) : relecture quand même (position serveur) et problème rendu', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(problem(409, 'APPOINTMENT_NOT_ACTIVE', 'Ce rendez-vous est annulé.'));
    const { store, load } = setup({ update });
    await store.show('week', d('2026-10-26'));
    const result = await store.move('rdv-2026-10-26-1', '2026-10-26T09:00:00.000Z', 50);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      problem: {
        status: 409,
        code: 'APPOINTMENT_NOT_ACTIVE',
        detail: 'Ce rendez-vous est annulé.',
      },
    });
    expect(store.appointments()).toHaveLength(14);
  });

  it('annuler, confirmer, note, série : chaque écriture relit la plage', async () => {
    const done = appointmentOf({ startsAt: '2026-10-26T08:00:00Z' });
    const { store, load, api } = setup({
      cancel: vi.fn().mockResolvedValue(done),
      confirm: vi.fn().mockResolvedValue(done),
      update: vi.fn().mockResolvedValue({ appointment: done, conflicts: [] }),
      cancelSeries: vi.fn().mockResolvedValue([done]),
    });
    await store.show('week', d('2026-10-26'));
    await store.cancel('a', 'empêchement');
    expect(api.cancel).toHaveBeenCalledWith('a', 'empêchement');
    await store.confirm('b');
    expect(api.confirm).toHaveBeenCalledWith('b');
    await store.saveNote('c', null);
    expect(api.update).toHaveBeenCalledWith('c', { planningNote: null });
    await store.cancelSeries('s');
    expect(api.cancelSeries).toHaveBeenCalledWith('s');
    expect(load).toHaveBeenCalledTimes(5);
  });

  it('contexte du patient : vue d’ensemble et rythme, une fois par patient ; erreur silencieuse', async () => {
    const { store, api } = setup();
    await store.loadContext('p-1');
    expect(store.context()?.preparation.data?.feelings).toBe(2);
    expect(store.context()?.rhythm).toBe('toutes les 2 semaines');
    await store.loadContext('p-1');
    expect(api.preparation).toHaveBeenCalledTimes(1);

    api.preparation.mockRejectedValueOnce(problem(500, 'INTERNAL_ERROR'));
    await store.loadContext('p-2');
    expect(store.context()?.preparation.status).toBe('error');
    expect(store.context()?.rhythm).toBe('toutes les 2 semaines');
  });

  it('stepped : la date suivante selon la vue, sans changer l’état', async () => {
    const { store } = setup();
    await store.show('month', d('2026-10-26'));
    expect(store.stepped(1).getMonth()).toBe(10);
    expect(store.stepped(-1).getMonth()).toBe(8);
    expect(store.date()).toBe('2026-10-26');
  });
});
