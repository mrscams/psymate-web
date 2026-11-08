import { emptyOverview, overviewView } from '../data/overview.fixtures';
import { feelingsSummary, localDay } from './overview-labels';

describe('overview-labels', () => {
  it('feelingsSummary : fenêtre, une description par émotion, comptes', () => {
    expect(feelingsSummary(overviewView().feelings, '90d')).toBe(
      'Ressentis notés sur 90 jours, une valeur par point : Anxiété (ressentis : 1) à 8 sur 10 ; ' +
        'Joie (ressentis : 1) à 4 sur 10. Jours de séance : 2 ; repères de médicament : 1.',
    );
  });

  it('feelingsSummary sans ressenti : ni « : » ni liste vide', () => {
    expect(feelingsSummary(emptyOverview().feelings, '30d')).toBe(
      'Ressentis notés sur 30 jours, une valeur par point. ' +
        'Jours de séance : 0 ; repères de médicament : 0.',
    );
  });

  it('feelingsSummary : intensités extrêmes ; seuls les repères de médicament sont comptés', () => {
    const feelings = overviewView().feelings;
    const second = { ...feelings.points[0], entryId: 'f-3', intensity: 3 };
    const session = { ...feelings.markers[0], kind: 'session' as const, change: null };
    const text = feelingsSummary(
      {
        ...feelings,
        points: [...feelings.points, second],
        markers: [...feelings.markers, session],
      },
      '12m',
    );
    expect(text).toContain('Anxiété (ressentis : 2) de 3 à 8 sur 10');
    expect(text).toContain('repères de médicament : 1.');
  });

  it('localDay : un horodatage local → son jour AAAA-MM-JJ', () => {
    expect(localDay(new Date(2026, 9, 7, 0, 0).getTime())).toBe('2026-10-07');
  });
});
