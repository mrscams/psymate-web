import { AgendaRange, Conflict } from '../data/agenda.model';
import {
  busyName,
  conflictMessage,
  formatDayMonth,
  formatMonthTitle,
  formatShortWeekdayDate,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
  formatWeekdayShort,
  isolate,
  rangeSegments,
  weekdayInitials,
} from './agenda-format';

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

/** Chiffres arabo-indiens (U+0660 à U+0669) et persans (U+06F0 à U+06F9) : jamais à l'écran (Q71). */
const EASTERN_DIGITS = /[٠-٩۰-۹]/;

describe('mises en forme de l’agenda en arabe (Q71, Q73)', () => {
  const monday = new Date(2026, 10, 16, 14, 5);
  const end = new Date(2026, 10, 16, 15, 0);

  it('heures sur 24 h et chiffres latins, avec le LOCALE_ID « ar » du bundle', () => {
    expect(formatTime(monday, 'ar')).toBe('14:05');
    expect(formatTimeRange(monday.toISOString(), end.toISOString(), 'ar')).toBe('14:05–15:00');
    const values = [
      formatWeekdayDate(monday, 'ar'),
      formatDayMonth(monday, 'ar'),
      formatMonthTitle(monday, 'ar'),
      formatShortWeekdayDate(monday, 'ar'),
      text(days([2026, 11, 16], [2026, 11, 22]), 'ar'),
      ...rangeSegments('day', days([2026, 11, 16], [2026, 11, 16]), 'ar').map((s) => s.text),
    ];
    for (const value of values) {
      expect(value).not.toMatch(EASTERN_DIGITS);
      expect(value).toMatch(/\d/);
    }
    expect(formatWeekdayShort(monday, 'ar')).not.toMatch(EASTERN_DIGITS);
    expect(formatMonthTitle(monday, 'ar')).toContain('2026');
  });

  it('calendrier grégorien, semaine au lundi : les initiales commencent au lundi', () => {
    const initials = weekdayInitials('ar');
    expect(initials).toHaveLength(7);
    const narrow = new Intl.DateTimeFormat('ar', { weekday: 'narrow' });
    expect(initials[0]).toBe(narrow.format(new Date(2024, 0, 1)));
    expect(initials[6]).toBe(narrow.format(new Date(2024, 0, 7)));
    expect(formatMonthTitle(new Date(2026, 10, 1), 'ar')).toContain(
      new Intl.DateTimeFormat('ar', { month: 'long' }).format(new Date(2026, 10, 1)),
    );
  });

  it('ni « 1er » ni capitale initiale hors du français ; le français et l’anglais gardent les leurs', () => {
    expect(rangeSegments('week', days([2026, 10, 26], [2026, 11, 1]), 'ar')).not.toContainEqual({
      text: 'er',
      sup: true,
    });
    expect(formatWeekdayDate(monday, 'ar')).toBe(
      new Intl.DateTimeFormat('ar-u-ca-gregory-hc-h23-nu-latn', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(monday),
    );
    expect(formatWeekdayDate(monday, 'fr')).toBe('Lundi 16 novembre');
    expect(formatMonthTitle(monday, 'fr')).toBe('Novembre 2026');
    expect(formatMonthTitle(monday, 'en')).toBe('November 2026');
  });
});

describe('isolate (valeur insérée dans une phrase assemblée en TypeScript)', () => {
  const conflict: Conflict = {
    appointmentId: 'a',
    patientDisplayName: 'Théo B.',
    startsAt: new Date(2026, 10, 16, 11, 30).toISOString(),
    endsAt: new Date(2026, 10, 16, 12, 0).toISOString(),
    occurrenceStartsAt: new Date(2026, 10, 16, 11, 0).toISOString(),
  };

  it('français et anglais : un nom écrit de droite à gauche est isolé, un nom latin inchangé', () => {
    expect(isolate('أحمد ب.', 'fr')).toBe('⁨أحمد ب.⁩');
    expect(isolate('Omar B.', 'fr')).toBe('Omar B.');
    expect(isolate('09:00–09:50', 'en', 'ltr')).toBe('09:00–09:50');
    expect(conflictMessage([conflict], 'fr')).toBe('Chevauche le rendez-vous de Théo B. à 11:30.');
    expect(busyName(conflict.startsAt, conflict.endsAt, 'Google Pro', 'fr')).toBe(
      'Indisponible de 11:30 à 12:00, agenda Google Pro',
    );
  });

  it('arabe : isolée dans son sens (U+2068) ou de gauche à droite (U+2066), refermée par U+2069', () => {
    expect(isolate('Omar B.', 'ar')).toBe('⁨Omar B.⁩');
    expect(isolate('09:00–09:50', 'ar', 'ltr')).toBe('⁦09:00–09:50⁩');
    expect(conflictMessage([conflict], 'ar')).toContain('⁨Théo B.⁩');
    expect(busyName(conflict.startsAt, conflict.endsAt, 'Google Pro', 'ar')).toContain(
      '⁨Google Pro⁩',
    );
  });
});
