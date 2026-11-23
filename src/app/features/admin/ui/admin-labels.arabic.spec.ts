import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import {
  formatAge,
  formatDay,
  formatMinute,
  formatSize,
  formatTimestamp,
  isolated,
  listText,
} from './admin-labels';

/** Chiffres arabo-indiens (U+0660 à U+0669, U+06F0 à U+06F9) : jamais affichés (G Q71). */
const ARABIC_INDIC = /[٠-٩۰-۹]/;
const AT = '2026-11-09T10:14:46Z';
const NOW = new Date('2026-11-12T10:14:46Z');

/**
 * M16-13 : les formats de l'administration passent par la locale de formatage (Q73) : en arabe,
 * chiffres latins et calendrier grégorien ; en français et en anglais, la sortie d'avant M16-13
 * (Intl avec la locale reçue, inchangée).
 */
describe('admin-labels, formats par la locale de formatage (M16-13)', () => {
  it('français et anglais : la sortie d’avant, Intl avec la locale reçue', () => {
    for (const locale of ['fr', 'en-US']) {
      const day = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(AT));
      expect(formatDay(AT, locale)).toBe(day);
      const time = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(AT));
      expect(formatTimestamp(AT, locale)).toBe(`${day} · ${time}`);
      expect(formatAge(AT, locale, NOW)).toBe(
        new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' }).format(
          -3,
          'day',
        ),
      );
      expect(formatSize(2_516_582, locale)).toBe(
        new Intl.NumberFormat(locale, {
          style: 'unit',
          unit: 'megabyte',
          unitDisplay: 'short',
          maximumFractionDigits: 1,
        }).format(2.4),
      );
    }
    expect(formatDay(AT, 'fr')).toBe('9 nov. 2026');
  });

  it('arabe : calendrier grégorien, chiffres latins, heures sur 24 h', () => {
    const day = formatDay(AT, 'ar');
    expect(day).toBe(
      new Intl.DateTimeFormat(ARABIC_FORMAT_LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(AT)),
    );
    expect(day).toContain('2026');
    expect(day).toMatch(/[\u0600-\u06FF]/);
    for (const text of [
      day,
      formatTimestamp(AT, 'ar'),
      formatMinute(AT, 'ar'),
      formatAge(AT, 'ar', NOW),
      formatSize(2_516_582, 'ar'),
    ]) {
      expect(text).not.toMatch(ARABIC_INDIC);
      expect(text).toMatch(/\d/);
    }
    expect(formatMinute('2026-11-09T22:05:00Z', 'ar')).not.toMatch(/[صم]/);
  });
});

describe('admin-labels, listes et valeurs insérées (M16-13)', () => {
  const ITEMS = ['Diplôme', "Pièce d'identité"];

  it('liste : virgules en français et en anglais, inchangées', () => {
    expect(listText(ITEMS, 'fr')).toBe("Diplôme, Pièce d'identité");
    expect(listText(ITEMS, 'en-US')).toBe("Diplôme, Pièce d'identité");
    expect(listText(['Diplôme'], 'fr')).toBe('Diplôme');
    expect(listText([], 'fr')).toBe('');
  });

  it('liste : en arabe, la conjonction de la locale, sans virgule latine', () => {
    const text = listText(ITEMS, 'ar');
    expect(text).toBe(
      new Intl.ListFormat(ARABIC_FORMAT_LOCALE, { type: 'conjunction' }).format(ITEMS),
    );
    expect(text).toContain('و');
    expect(text).not.toContain(', ');
    expect(listText([], 'ar')).toBe('');
  });

  it('valeur isolée : inchangée en français et en anglais, entre FSI et PDI en arabe', () => {
    expect(isolated('Claire Moreau', 'fr')).toBe('Claire Moreau');
    expect(isolated('Claire Moreau', 'en-US')).toBe('Claire Moreau');
    expect(isolated('Claire Moreau', 'ar')).toBe(
      `${String.fromCharCode(0x2068)}Claire Moreau${String.fromCharCode(0x2069)}`,
    );
  });
});
