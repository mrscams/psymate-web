import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { AgendaApi, toAppointment, toCreateRequest, toPreparation } from './agenda.api';

// Le client généré n'est importé que par agenda.api.ts : ici, on observe les requêtes HTTP.
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
  });
  return { api: TestBed.inject(AgendaApi), http: TestBed.inject(HttpTestingController) };
}

const dto = {
  id: 'a-1',
  patient: { id: 'p-1', displayName: 'Marie D.', birthDate: '1992-03-14', archived: false },
  seriesId: 's-1',
  startsAt: '2026-11-07T09:00:00Z',
  endsAt: '2026-11-07T09:50:00Z',
  durationMin: 50,
  modality: 'video',
  status: 'tentative',
  planningNote: 'carnet',
  createdAt: '2026-11-01T08:00:00Z',
  updatedAt: '2026-11-01T08:00:00Z',
};

describe('AgendaApi · traduction des DTO', () => {
  it('AppointmentDto → modèle de vue : âge calculé, absents à null, énumérations inconnues ramenées', () => {
    const view = toAppointment(dto as never);
    expect(view).toMatchObject({
      id: 'a-1',
      seriesId: 's-1',
      startsAt: '2026-11-07T09:00:00Z',
      durationMin: 50,
      modality: 'video',
      status: 'tentative',
      planningNote: 'carnet',
      cancelReason: null,
      cancelledAt: null,
      sessionEntryId: null,
      origin: 'practitioner',
    });
    expect(view.patient).toMatchObject({ id: 'p-1', displayName: 'Marie D.', archived: false });
    expect(view.patient?.age).toBeGreaterThanOrEqual(34);
    expect(view.guest).toBeNull();
    const odd = toAppointment({
      ...dto,
      modality: 'email',
      status: 'x',
      durationMin: undefined,
    } as never);
    expect(odd.modality).toBe('in_person');
    expect(odd.status).toBe('planned');
    expect(odd.durationMin).toBe(50);
  });

  it('rendez-vous invité (contrat 0.13.0) : patient null, invité lu, champs vides → null', () => {
    const guest = toAppointment({
      ...dto,
      patient: null,
      guest: { firstName: 'Sara', lastName: 'Benali', phone: ' ', purgedAt: null },
    } as never);
    expect(guest.patient).toBeNull();
    expect(guest.guest).toEqual({
      firstName: 'Sara',
      lastName: 'Benali',
      phone: null,
      email: null,
      purgedAt: null,
    });

    const purged = toAppointment({
      ...dto,
      patient: undefined,
      guest: {
        firstName: null,
        lastName: null,
        phone: null,
        email: null,
        purgedAt: '2027-05-01T03:30:00Z',
      },
    } as never);
    expect(purged.patient).toBeNull();
    expect(purged.guest).toEqual({
      firstName: null,
      lastName: null,
      phone: null,
      email: null,
      purgedAt: '2027-05-01T03:30:00Z',
    });

    const neither = toAppointment({ ...dto, patient: null } as never);
    expect(neither.patient).toBeNull();
    expect(neither.guest).toBeNull();
  });

  it('demande en ligne (contrat 0.15.0) : origine online, invité avec e-mail', () => {
    const online = toAppointment({
      ...dto,
      patient: null,
      origin: 'online',
      status: 'tentative',
      guest: {
        firstName: 'Sara',
        lastName: 'Benali',
        phone: null,
        email: 'sara.benali@example.test',
        purgedAt: null,
      },
    } as never);
    expect(online.origin).toBe('online');
    expect(online.status).toBe('tentative');
    expect(online.guest).toEqual({
      firstName: 'Sara',
      lastName: 'Benali',
      phone: null,
      email: 'sara.benali@example.test',
      purgedAt: null,
    });
  });

  it('origine : practitioner lue telle quelle ; absente ou inconnue → practitioner', () => {
    expect(toAppointment({ ...dto, origin: 'practitioner' } as never).origin).toBe('practitioner');
    expect(toAppointment({ ...dto, origin: 'phone_call' } as never).origin).toBe('practitioner');
  });

  it('invité avec e-mail saisi par le praticien : e-mail lu, blanc → null', () => {
    const withEmail = toAppointment({
      ...dto,
      patient: null,
      guest: { lastName: 'Benali', email: 'sara.benali@example.test' },
    } as never);
    expect(withEmail.origin).toBe('practitioner');
    expect(withEmail.guest?.email).toBe('sara.benali@example.test');
    const blank = toAppointment({
      ...dto,
      patient: null,
      guest: { lastName: 'Benali', email: '  ' },
    } as never);
    expect(blank.guest?.email).toBeNull();
  });

  it('vue d’ensemble → bloc Préparer : dernière séance, entrées depuis par nature, suivi depuis', () => {
    const prep = toPreparation({
      facts: { followedSince: '2025-03-01' },
      sinceLastSession: {
        lastSessionAt: '2026-10-31T09:00:00Z',
        entries: [{ type: 'feeling' }, { type: 'feeling' }, { type: 'event' }, { type: 'note' }],
      },
    } as never);
    expect(prep).toEqual({
      lastSessionAt: '2026-10-31T09:00:00Z',
      feelings: 2,
      events: 1,
      others: 1,
      followedSince: '2025-03-01',
    });
    expect(toPreparation({} as never)).toEqual({
      lastSessionAt: null,
      feelings: 0,
      events: 0,
      others: 0,
      followedSince: null,
    });
  });

  it('création : note vide omise, répétition count ou until (jamais les deux)', () => {
    const base = {
      patientId: 'p-1',
      startsAt: '2026-11-07T09:00:00.000Z',
      durationMin: 50,
      modality: 'in_person' as const,
      planningNote: '  ',
      tentative: true,
      tz: 'Europe/Paris',
    };
    expect(toCreateRequest(base)).toEqual({
      patientId: 'p-1',
      startsAt: '2026-11-07T09:00:00.000Z',
      durationMin: 50,
      modality: 'in_person',
      tentative: true,
      tz: 'Europe/Paris',
    });
    expect(
      toCreateRequest({ ...base, recurrence: { everyWeeks: 2, count: 3 } }).recurrence,
    ).toEqual({ everyWeeks: 2, count: 3 });
    expect(
      toCreateRequest({ ...base, recurrence: { everyWeeks: 4, until: '2026-12-31', count: 9 } })
        .recurrence,
    ).toEqual({ everyWeeks: 4, until: '2026-12-31' });
  });
});

describe('AgendaApi · requêtes', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('load : GET /api/agenda?from&to en UTC ISO, busy ignoré', async () => {
    const { api, http } = setup();
    const from = new Date(Date.UTC(2026, 9, 26));
    const to = new Date(Date.UTC(2026, 10, 2));
    const pending = api.load({ from, to });
    const req = http.expectOne((r) => r.url === '/api/agenda' && r.method === 'GET');
    // Une seule fois encodé dans l'URL envoyée (le client généré encode, HttpParams n'y revient pas).
    expect(req.request.urlWithParams).toContain('from=2026-10-26T00%3A00%3A00.000Z');
    expect(decodeURIComponent(req.request.params.get('from')!)).toBe('2026-10-26T00:00:00.000Z');
    expect(decodeURIComponent(req.request.params.get('to')!)).toBe('2026-11-02T00:00:00.000Z');
    req.flush({ from: '', to: '', appointments: [dto], busy: [{ any: 1 }] });
    const data = await pending;
    expect(data.busy).toEqual([]);
    expect(data.appointments.map((a) => a.id)).toEqual(['a-1']);
  });

  it('requests : GET /api/agenda/requests, rendez-vous dans l’ordre de l’API, sans filtre', async () => {
    const { api, http } = setup();
    const pending = api.requests();
    const req = http.expectOne((r) => r.url === '/api/agenda/requests' && r.method === 'GET');
    const online = (id: string, startsAt: string) => ({
      ...dto,
      id,
      patient: undefined,
      guest: { firstName: 'Sara', lastName: 'Benali', email: 'sara@example.test' },
      origin: 'online',
      startsAt,
    });
    req.flush({
      appointments: [online('r-2', '2026-11-26T09:00:00Z'), online('r-1', '2026-11-25T09:00:00Z')],
    });
    const list = await pending;
    expect(list.map((a) => [a.id, a.origin, a.guest?.email])).toEqual([
      ['r-2', 'online', 'sara@example.test'],
      ['r-1', 'online', 'sara@example.test'],
    ]);

    const empty = api.requests();
    http.expectOne('/api/agenda/requests').flush({});
    expect(await empty).toEqual([]);
  });

  it('freeBusy : créneau, fuseau et voisinage', async () => {
    const { api, http } = setup();
    const pending = api.freeBusy(
      new Date('2026-11-07T09:00:00Z'),
      new Date('2026-11-07T09:50:00Z'),
      'Europe/Paris',
    );
    const req = http.expectOne((r) => r.url === '/api/agenda/freebusy');
    expect(decodeURIComponent(req.request.params.get('tz')!)).toBe('Europe/Paris');
    expect(req.request.params.has('excludeAppointmentId')).toBe(false);
    req.flush({
      conflicts: [
        { appointmentId: 'b', patientDisplayName: 'Théo B.', startsAt: 's', endsAt: 'e' },
      ],
      next: dto,
    });
    const result = await pending;
    expect(result.conflicts[0]).toEqual({
      appointmentId: 'b',
      patientDisplayName: 'Théo B.',
      startsAt: 's',
      endsAt: 'e',
      occurrenceStartsAt: 's',
    });
    expect(result.previous).toBeNull();
    expect(result.next?.id).toBe('a-1');
  });

  it('patientAppointments : défauts (rythme vide → null)', async () => {
    const { api, http } = setup();
    const pending = api.patientAppointments('p-1');
    http.expectOne('/api/patients/p-1/appointments').flush({
      appointments: [dto],
      defaults: { durationMin: 45, modality: 'phone', rhythm: ' ' },
    });
    expect((await pending).defaults).toEqual({ durationMin: 45, modality: 'phone', rhythm: null });
  });

  it('update, cancel, confirm, cancelSeries : routes et corps du contrat', async () => {
    const { api, http } = setup();
    const moved = api.update('a-1', { startsAt: '2026-11-07T10:00:00Z', durationMin: 60 });
    const patch = http.expectOne('/api/appointments/a-1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ startsAt: '2026-11-07T10:00:00Z', durationMin: 60 });
    patch.flush({ appointment: dto, conflicts: [] });
    expect((await moved).appointment.id).toBe('a-1');

    const note = api.update('a-1', { planningNote: null });
    const notePatch = http.expectOne('/api/appointments/a-1');
    expect(notePatch.request.body).toEqual({ planningNote: null });
    notePatch.flush({ appointment: dto, conflicts: [] });
    await note;

    const cancelled = api.cancel('a-1', 'empêchement');
    const cancel = http.expectOne('/api/appointments/a-1/cancel');
    expect(cancel.request.body).toEqual({ reason: 'empêchement' });
    cancel.flush({ ...dto, status: 'cancelled', cancelReason: 'empêchement' });
    expect((await cancelled).status).toBe('cancelled');

    const confirmed = api.confirm('a-1');
    http.expectOne('/api/appointments/a-1/confirm').flush({ ...dto, status: 'planned' });
    expect((await confirmed).status).toBe('planned');

    const series = api.cancelSeries('s-1');
    const seriesReq = http.expectOne('/api/appointments/series/s-1/cancel');
    expect(seriesReq.request.body).toEqual({});
    seriesReq.flush({ appointments: [{ ...dto, status: 'cancelled' }] });
    expect((await series).map((a) => a.status)).toEqual(['cancelled']);
  });

  it('attachPatient : POST …/attach-patient avec patientId et includeSameGuest ; rend les rendez-vous rattachés', async () => {
    const { api, http } = setup();
    const pending = api.attachPatient('g-1', 'p-9', true);
    const req = http.expectOne('/api/appointments/g-1/attach-patient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ patientId: 'p-9', includeSameGuest: true });
    req.flush({
      appointments: [
        { ...dto, id: 'g-1', patient: { id: 'p-9', displayName: 'Quentin S.' }, guest: null },
        { ...dto, id: 'g-2', patient: { id: 'p-9', displayName: 'Quentin S.' }, guest: null },
      ],
    });
    const attached = await pending;
    expect(attached.map((a) => [a.id, a.patient?.id, a.guest])).toEqual([
      ['g-1', 'p-9', null],
      ['g-2', 'p-9', null],
    ]);

    const single = api.attachPatient('g-3', 'p-9', false);
    const one = http.expectOne('/api/appointments/g-3/attach-patient');
    expect(one.request.body).toEqual({ patientId: 'p-9', includeSameGuest: false });
    one.flush({});
    expect(await single).toEqual([]);
  });

  it('searchPatients : patients actifs, triés par nom, archivés écartés', async () => {
    const { api, http } = setup();
    const pending = api.searchPatients(' mar ');
    const req = http.expectOne((r) => r.url === '/api/patients');
    expect(req.request.params.get('q')).toBe('mar');
    expect(req.request.params.get('archived')).toBe('false');
    expect(req.request.params.get('sort')).toBe('name');
    req.flush({
      items: [
        { id: 'p-1', displayName: 'Marie D.', birthDate: null },
        { id: 'p-2', displayName: 'Marc A.', archivedAt: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(await pending).toEqual([{ id: 'p-1', displayName: 'Marie D.', age: null }]);
  });
});
