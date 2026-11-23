import {
  ageInYears,
  formatDate,
  formatDateTime,
  formatDelay,
  formatMinutes,
  formatMonthYear,
  formatRelativeDay,
  minutesBetween,
} from './formats';
import { ARABIC_FORMAT_LOCALE, formatLocale } from './locales';

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

/** Chiffres arabo-indiens (U+0660 à U+0669) et arabo-indiens étendus (U+06F0 à U+06F9). */
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

describe('formats Intl en arabe (Q73, G Q71 : chiffres latins, calendrier grégorien)', () => {
  const now = new Date(2026, 9, 20, 15, 0);
  const instant = '2026-10-17T14:03:00Z';
  const outputs = (locale: string): Record<string, string> => ({
    formatDate: formatDate(instant, locale, 'medium', 'UTC'),
    formatDateShort: formatDate(instant, locale, 'short', 'UTC'),
    formatDateLong: formatDate(instant, locale, 'long', 'UTC'),
    formatDateTime: formatDateTime(instant, locale, 'UTC'),
    formatMonthYear: formatMonthYear(instant, locale, 'UTC'),
    formatRelativeDay: formatRelativeDay(new Date(2026, 9, 17), locale, now),
    formatRelativeDayFar: formatRelativeDay(new Date(2026, 5, 1), locale, now),
    formatMinutes: formatMinutes(18, locale),
    formatMinutesLong: formatMinutes(125, locale),
    formatDelay: formatDelay(872, locale),
    formatDelayShort: formatDelay(12, locale),
  });

  // ar-EG rend des chiffres arabo-indiens si on lui passe la locale telle quelle : la conversion
  // en locale de formatage est donc bien ce qui les écarte.
  it.each(['ar', 'ar-EG', 'ar-SA'])('bundle %s : aucun chiffre arabo-indien', (locale) => {
    for (const [name, text] of Object.entries(outputs(locale))) {
      expect(text, name).not.toMatch(ARABIC_INDIC_DIGITS);
      expect(text, name).not.toBe('');
    }
    expect(new Intl.DateTimeFormat('ar-EG').format(new Date(instant))).toMatch(ARABIC_INDIC_DIGITS);
  });

  it.each(['ar', 'ar-EG', 'ar-SA'])('bundle %s : année grégorienne', (locale) => {
    const text = outputs(locale);
    for (const name of ['formatDate', 'formatDateShort', 'formatDateLong', 'formatDateTime']) {
      expect(text[name], name).toContain('2026');
      expect(text[name], name).toContain('17');
    }
    expect(text['formatMonthYear']).toContain('2026');
    expect(text['formatRelativeDayFar']).toContain('2026');
    const resolved = new Intl.DateTimeFormat(formatLocale(locale)).resolvedOptions();
    expect(resolved.calendar).toBe('gregory');
    expect(resolved.numberingSystem).toBe('latn');
  });

  it('locale de formatage : ar-u-nu-latn-ca-gregory en arabe, la locale reçue sinon', () => {
    expect(ARABIC_FORMAT_LOCALE).toBe('ar-u-nu-latn-ca-gregory');
    expect(formatLocale('ar')).toBe(ARABIC_FORMAT_LOCALE);
    expect(formatLocale('ar-MA')).toBe(ARABIC_FORMAT_LOCALE);
    expect(formatLocale(ARABIC_FORMAT_LOCALE)).toBe(ARABIC_FORMAT_LOCALE);
    expect(formatLocale('fr')).toBe('fr');
    expect(formatLocale('en')).toBe('en');
    expect(formatLocale('en-US')).toBe('en-US');
  });

  it('français et anglais inchangés', () => {
    expect(formatDate(instant, 'fr', 'medium', 'UTC')).toBe(
      new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(instant),
      ),
    );
    expect(formatDateTime(instant, 'en', 'UTC')).toBe(
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(instant)),
    );
  });
});
