import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../auth';
import { defaultPreferences } from '../preferences.model';
import { PreferencesApi } from './preferences.api';

// Le client généré est réel : on observe les requêtes HTTP de GET et PATCH /api/me/preferences.
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
  });
  return { api: TestBed.inject(PreferencesApi), http: TestBed.inject(HttpTestingController) };
}

/** Réponse d'une API d'avant 0.15.0 : les 13 clés, aucune booking.*. */
const withoutBooking = {
  'overview.view': 'simple',
  'overview.window': '30d',
  'timeline.groupBy': 'month',
  theme: 'dark',
  locale: 'fr',
  'vocabulary.subjectLabel': 'patient',
  'entryTypes.medicationVisible': false,
  'entries.defaultVisibility': 'clinical',
  'sessions.defaultDurationMin': 50,
  'agenda.dayStartHour': 8,
  'agenda.dayEndHour': 19,
  'agenda.workingDays': [1, 2, 3, 4, 5],
  'agenda.defaultView': 'week',
};

describe('PreferencesApi · clés booking.* (contrat 0.15.0)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('GET sans clé booking.* : les huit défauts', async () => {
    const { api, http } = setup();
    const defaults = defaultPreferences('psychologist');
    const pending = api.get(defaults);
    http.expectOne('/api/me/preferences').flush(withoutBooking);
    const prefs = await pending;
    expect(prefs['sessions.defaultDurationMin']).toBe(50);
    expect(prefs).toMatchObject({
      'booking.enabled': false,
      'booking.confirmation': 'manual',
      'booking.windows': [],
      'booking.slotDurationMin': 60,
      'booking.minNoticeHours': 24,
      'booking.horizonDays': 28,
      'booking.modalities': ['in_person'],
      'booking.timezone': 'Europe/Paris',
    });
  });

  it('GET avec les 21 clés : booking.* lues, une plage mal formée et un mode inconnu ramenés au défaut', async () => {
    const { api, http } = setup();
    const pending = api.get(defaultPreferences('psychologist'));
    http.expectOne('/api/me/preferences').flush({
      ...withoutBooking,
      'booking.enabled': true,
      'booking.confirmation': 'sometimes',
      'booking.windows': [{ day: 1, start: '09:00', end: '08:00' }],
      'booking.slotDurationMin': 30,
      'booking.minNoticeHours': 48,
      'booking.horizonDays': 14,
      'booking.modalities': ['video', 'phone'],
      'booking.timezone': 'Europe/Brussels',
    });
    const prefs = await pending;
    expect(prefs).toMatchObject({
      'booking.enabled': true,
      'booking.confirmation': 'manual',
      'booking.windows': [],
      'booking.slotDurationMin': 30,
      'booking.minNoticeHours': 48,
      'booking.horizonDays': 14,
      'booking.modalities': ['video', 'phone'],
      'booking.timezone': 'Europe/Brussels',
    });
  });

  it('PATCH : les plages et les modalités partent en tableaux JSON', async () => {
    const { api, http } = setup();
    const windows = [{ day: 2, start: '14:00', end: '18:00' }];
    const pending = api.patch(
      { 'booking.windows': windows, 'booking.modalities': ['video'] },
      defaultPreferences(null),
    );
    const request = http.expectOne('/api/me/preferences');
    expect(request.request.method).toBe('PATCH');
    expect(JSON.parse(JSON.stringify(request.request.body))).toEqual({
      'booking.windows': windows,
      'booking.modalities': ['video'],
    });
    request.flush({
      ...withoutBooking,
      'booking.windows': windows,
      'booking.modalities': ['video'],
    });
    const prefs = await pending;
    expect(prefs['booking.windows']).toEqual(windows);
    expect(prefs['booking.modalities']).toEqual(['video']);
  });
});
