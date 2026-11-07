import {
  ageInYears,
  formatDate,
  formatDelay,
  formatMinutes,
  formatMonthYear,
  formatRelativeDay,
  minutesBetween,
} from './formats';

/** Intl sépare nombre et unité par une espace fine insécable : on la ramène à une espace. */
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formats Intl', () => {
  it('dates dans la locale', () => {
    expect(formatDate('2026-10-17T12:00:00Z', 'fr', 'medium', 'UTC')).toBe('17 oct. 2026');
    expect(formatDate('2026-10-17T12:00:00Z', 'en', 'medium', 'UTC')).toBe('Oct 17, 2026');
    expect(formatMonthYear('2025-03-05T00:00:00Z', 'fr', 'UTC')).toBe('mars 2025');
    expect(formatDate('n/a', 'fr')).toBe('');
  });

  it('jours relatifs', () => {
    const now = new Date(2026, 9, 20, 15, 0);
    expect(formatRelativeDay(new Date(2026, 9, 20, 8), 'fr', now)).toBe('aujourd’hui');
    expect(formatRelativeDay(new Date(2026, 9, 19, 23), 'fr', now)).toBe('hier');
    expect(plain(formatRelativeDay(new Date(2026, 9, 17), 'fr', now))).toBe('il y a 3 j');
    expect(formatRelativeDay(new Date(2026, 9, 17), 'en', now)).toBe('3 days ago');
    expect(formatRelativeDay(new Date(2026, 5, 1), 'fr', now)).toBe('1 juin 2026');
  });

  it('minutes et durées', () => {
    const start = new Date(2026, 9, 24, 14, 0);
    expect(minutesBetween(start, new Date(2026, 9, 24, 14, 18, 30))).toBe(18);
    expect(minutesBetween(start, new Date(2026, 9, 24, 13, 0))).toBe(0);
    expect(plain(formatMinutes(18, 'fr'))).toBe('18 min');
    expect(plain(formatMinutes(65, 'fr'))).toBe('1 h 05');
    expect(plain(formatMinutes(120, 'en'))).toBe('2 hr');
  });

  it('délai d’un Retry-After', () => {
    expect(plain(formatDelay(12, 'fr'))).toBe('12 s');
    expect(plain(formatDelay(872, 'fr'))).toBe('14 min 32 s');
    expect(plain(formatDelay(900, 'en'))).toBe('15 min');
    expect(plain(formatDelay(-3, 'fr'))).toBe('0 s');
  });

  it('âge en années', () => {
    const now = new Date(Date.UTC(2026, 9, 20));
    expect(ageInYears('1992-10-21', now)).toBe(33);
    expect(ageInYears('1992-10-20', now)).toBe(34);
    expect(ageInYears(null, now)).toBeNull();
    expect(ageInYears('2030-01-01', now)).toBeNull();
  });
});
