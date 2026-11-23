import { relativeAgo } from './relative-time';

describe('relativeAgo', () => {
  const now = new Date('2026-11-23T15:00:00Z');

  // Intl sépare nombre et unité par une espace insécable : ramenée à une espace pour comparer.
  const plain = (text: string) => text.replace(/\s/g, ' ');

  it('minutes, heures, jours, dans la langue reçue', () => {
    expect(plain(relativeAgo('2026-11-23T14:42:00Z', 'fr', now))).toBe('il y a 18 min');
    expect(plain(relativeAgo('2026-11-23T13:00:00Z', 'en', now))).toBe('2 hr. ago');
    expect(relativeAgo(null, 'fr', now)).toBe('');
    expect(relativeAgo('pas une date', 'fr', now)).toBe('');
  });

  it('arabe : locale de formatage de core/i18n, chiffres latins quel que soit le pays (Q73)', () => {
    // ar-EG compte en chiffres arabo-indiens par défaut (« قبل ٣ أيام ») : la locale de formatage
    // les ramène aux chiffres latins.
    for (const locale of ['ar', 'ar-EG']) {
      const text = relativeAgo('2026-11-20T15:00:00Z', locale, now);
      expect(text).toContain('3');
      expect(text).not.toMatch(/[٠-٩۰-۹]/);
      expect(text).toMatch(/[؀-ۿ]/);
    }
  });
});
