// Jeux de données des tests de la prise de rendez-vous (fiche 31).
import { BookingRequest, PublicBooking, SlotList, SlotWindow } from './booking.models';

export const CLAIRE_BOOKING: PublicBooking = {
  slug: 'claire-martin',
  displayName: 'Claire Martin',
  confirmation: 'manual',
  slotDurationMin: 60,
  modalities: ['in_person', 'video'],
  timezone: 'Europe/Paris',
  minNoticeHours: 24,
  horizonDays: 28,
};

export const KARIM_BOOKING: PublicBooking = {
  slug: 'karim-haddad',
  displayName: 'Karim Haddad',
  confirmation: 'auto',
  slotDurationMin: 45,
  modalities: ['in_person'],
  timezone: 'Europe/Paris',
  minNoticeHours: 24,
  horizonDays: 28,
};

/** Fenêtre du 23 novembre au 6 décembre 2026. */
export const WINDOW: SlotWindow = { from: '2026-11-23', to: '2026-12-06' };

/** Trois créneaux sur deux jours (heure de Paris : mardi 16:00, 17:00 ; mercredi 09:00). */
export const SLOTS: SlotList = {
  window: WINDOW,
  timezone: 'Europe/Paris',
  slots: [
    { startsAt: '2026-11-24T15:00:00Z', endsAt: '2026-11-24T16:00:00Z' },
    { startsAt: '2026-11-24T16:00:00Z', endsAt: '2026-11-24T17:00:00Z' },
    { startsAt: '2026-11-25T08:00:00Z', endsAt: '2026-11-25T09:00:00Z' },
  ],
};

export const NO_SLOTS: SlotList = { window: WINDOW, timezone: 'Europe/Paris', slots: [] };

export function bookingRequest(formShownAt: number): BookingRequest {
  return {
    startsAt: SLOTS.slots[0].startsAt,
    modality: 'video',
    firstName: 'Sara',
    lastName: 'Benali',
    email: 'sara.benali@example.test',
    phone: '',
    locale: 'fr',
    consent: true,
    website: '',
    formShownAt: new Date(formShownAt).toISOString(),
  };
}
