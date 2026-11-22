import { AgendaRange } from '../data/agenda.model';
import { rangeSegments } from './agenda-format';

/** Plage en heure locale, fin exclue (comme rangeFor) : du jour `from` au jour `to` compris. */
function days(from: [number, number, number], to: [number, number, number]): AgendaRange {
  return {
    from: new Date(from[0], from[1] - 1, from[2]),
    to: new Date(to[0], to[1] - 1, to[2] + 1),
  };
}

function text(range: AgendaRange, locale: string): string {
  return rangeSegments('week', range, locale)
    .map((segment) => segment.text)
    .join('');
}

describe('rangeSegments (plage de la barre d’outils)', () => {
  const sameMonth = days([2026, 11, 16], [2026, 11, 22]);
  const twoMonths = days([2026, 10, 26], [2026, 11, 1]);
  const twoYears = days([2026, 12, 28], [2027, 1, 3]);

  it('français : jour seul au début dans un même mois, « 1er » en exposant, années aux deux bornes', () => {
    expect(text(sameMonth, 'fr')).toBe('16 – 22 novembre 2026');
    expect(text(twoMonths, 'fr')).toBe('26 octobre – 1er novembre 2026');
    expect(rangeSegments('week', twoMonths, 'fr')).toContainEqual({ text: 'er', sup: true });
    expect(text(twoYears, 'fr')).toBe('28 décembre 2026 – 3 janvier 2027');
  });

  it('anglais : le mois précède le jour, la plage suit l’ordre de la langue', () => {
    expect(text(sameMonth, 'en')).toMatch(/^November 16\s–\s22, 2026$/);
    expect(text(twoMonths, 'en')).toMatch(/^October 26\s–\sNovember 1, 2026$/);
    expect(text(twoYears, 'en')).toMatch(/^December 28, 2026\s–\sJanuary 3, 2027$/);
  });
});
