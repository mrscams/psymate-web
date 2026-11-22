import { appointment } from '../data/booking-link.fixtures';
import { appointmentDetail, browserTimeZone } from './booking-link-format';

describe('détail d’un rendez-vous par lien (fiche 32)', () => {
  it('heures dans le fuseau du navigateur, nommé comme la maquette', () => {
    expect(appointmentDetail(appointment(), 'fr', 'Europe/Paris')).toEqual({
      practitioner: { slug: 'claire-martin', name: 'Claire Martin' },
      day: 'jeudi 26 novembre 2026',
      hours: '10:00 – 11:00',
      zone: 'heure de votre appareil, Europe/Paris',
      duration: '60 min',
      modality: 'Au cabinet',
    });
  });

  it('un autre fuseau de navigateur change l’heure et la date affichées', () => {
    const detail = appointmentDetail(
      appointment({ startsAt: '2026-11-26T03:00:00Z', endsAt: '2026-11-26T04:00:00Z' }),
      'fr',
      'America/Montreal',
    );
    expect(detail.day).toBe('mercredi 25 novembre 2026');
    expect(detail.hours).toBe('22:00 – 23:00');
    expect(detail.zone).toBe('heure de votre appareil, America/Montreal');
  });

  it('fiche dépubliée : pas de praticien', () => {
    const detail = appointmentDetail(
      appointment({ practitioner: { slug: null, displayName: null }, modality: 'video' }),
      'fr',
      'Europe/Paris',
    );
    expect(detail.practitioner).toBeNull();
    expect(detail.modality).toBe('En visio');
  });

  it('le fuseau du navigateur est un nom IANA', () => {
    expect(browserTimeZone()).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/);
  });
});
