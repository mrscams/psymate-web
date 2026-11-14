import { emptyOverview, overviewView } from '../data/overview.fixtures';
import { sessionModalityLabel } from '../../../shared/ui';
import {
  emphasize,
  feelingsSummary,
  formatComputedAt,
  formatMonth,
  formatShortDateTime,
  formatShortDay,
  localDay,
  sessionLine,
} from './overview-labels';

/** Espaces insécables (Intl) ramenées à des espaces simples. */
const n = (text: string) => text.replace(/\s/g, ' ');

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

  it('sessionLine : « Jeudi 5 novembre · cabinet · 50 min », la nature hors séance ordinaire', () => {
    const now = new Date(2026, 10, 14, 12, 0);
    const [last, previous] = overviewView().recentSessions;
    expect(n(sessionLine(last, 'fr', sessionModalityLabel, now))).toBe(
      'Samedi 17 octobre · cabinet · 50 min',
    );
    expect(n(sessionLine(previous, 'fr', sessionModalityLabel, now))).toBe(
      'Samedi 10 octobre · visio · 50 min',
    );
    const intake = { ...last, kind: 'intake' as const, modality: null, durationMin: null };
    expect(n(sessionLine(intake, 'fr', sessionModalityLabel, now))).toBe(
      'Samedi 17 octobre · Accueil',
    );
  });

  it('formats courts : jour, jour et heure, mois, heure du calcul', () => {
    const now = new Date(2026, 10, 14, 15, 0);
    expect(n(formatShortDay('2026-10-15', 'fr', now))).toBe('15 oct.');
    expect(n(formatShortDay('2025-10-15', 'fr', now))).toBe('15 oct. 2025');
    expect(n(formatShortDateTime(new Date(2026, 10, 12, 9, 20).toISOString(), 'fr', now))).toBe(
      '12 nov. 09:20',
    );
    expect(n(formatMonth('2026-09-01', 'fr', false, now))).toBe('sept. 2026');
    expect(n(formatMonth('2026-10-03T08:00:00Z', 'fr', true, now))).toBe('oct.');
    expect(n(formatComputedAt(new Date(2026, 10, 14, 11, 3).toISOString(), 'fr', now))).toBe(
      '11:03',
    );
    expect(n(formatComputedAt(new Date(2026, 10, 8, 11, 3).toISOString(), 'fr', now))).toBe(
      '8 nov. 11:03',
    );
  });

  it('emphasize : faits en gras (dates, chiffres, citations), texte rendu à l’identique', () => {
    const sentence =
      "Suivi depuis le 12 mars 2025 : 31 séances ; l'intensité baisse (4,5 contre 6,5), 8/10 le " +
      '3 octobre ; le ressenti le plus fréquent est « Anxiété » (M2 et T4 ignorés).';
    const parts = emphasize(sentence);
    expect(parts.map((p) => p.text).join('')).toBe(sentence);
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual([
      '12 mars 2025',
      '31',
      '4,5',
      '6,5',
      '8/10',
      '3 octobre',
      '« Anxiété »',
    ]);
    expect(emphasize('March 12, 2025 and 12 March')).toEqual([
      { text: 'March 12, 2025', strong: true },
      { text: ' and ', strong: false },
      { text: '12 March', strong: true },
    ]);
    expect(emphasize('')).toEqual([]);
  });
});
