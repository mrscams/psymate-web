import { emptyOverview, overviewView } from '../data/overview.fixtures';
import {
  emphasize,
  feelingsSummary,
  formatElapsed,
  formatRecorded,
  intensityPath,
  intensitySpan,
  localDay,
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

  it('formatRecorded : minutes et heures le jour même, « hier », jours de la semaine, puis la date', () => {
    const now = new Date(2026, 10, 11, 15, 0);
    const at = (d: Date) => d.toISOString();
    expect(n(formatRecorded(at(new Date(2026, 10, 11, 14, 59, 40)), 'fr', now))).toBe('maintenant');
    expect(n(formatRecorded(at(new Date(2026, 10, 11, 14, 54)), 'fr', now))).toBe('il y a 6 min');
    expect(n(formatRecorded(at(new Date(2026, 10, 11, 12, 0)), 'fr', now))).toBe('il y a 3 h');
    expect(n(formatRecorded(at(new Date(2026, 10, 10, 9, 0)), 'fr', now))).toBe('hier');
    expect(n(formatRecorded(at(new Date(2026, 10, 7, 9, 0)), 'fr', now))).toBe('il y a 4 j');
    expect(n(formatRecorded(at(new Date(2026, 8, 12, 9, 0)), 'fr', now))).toBe('12 sept.');
    expect(n(formatRecorded(at(new Date(2025, 8, 12, 9, 0)), 'fr', now))).toBe('12 sept. 2025');
    expect(formatRecorded(at(new Date(2026, 10, 10, 9, 0)), 'en', now)).toBe('yesterday');
  });

  it('formatElapsed : jours, semaines, mois, années en unités courtes', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(n(formatElapsed('2026-11-06', 'fr', now))).toBe('5 j');
    expect(n(formatElapsed('2026-09-30', 'fr', now))).toBe('6 sem.');
    expect(n(formatElapsed('2026-04-01T08:00:00Z', 'fr', now))).toBe('7 mois');
    expect(n(formatElapsed('2023-06-01', 'fr', now))).toBe('3 ans');
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

  it('intensityPath / intensitySpan : valeurs de la phrase-titre', () => {
    expect(intensityPath([4, 5, 8])).toBe('4/10 → 8/10');
    expect(intensityPath([6])).toBe('6/10');
    expect(intensityPath([])).toBe('');
    expect(intensitySpan([5, 3, 4])).toBe('3–5/10');
    expect(intensitySpan([4, 4])).toBe('4/10');
  });
});
