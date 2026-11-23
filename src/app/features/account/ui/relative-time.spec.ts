import { relativeAgo } from './relative-time';

describe('relativeAgo (M16-12, version arabe)', () => {
  const now = Date.parse('2026-11-23T10:00:00Z');

  it('français inchangé', () => {
    expect(relativeAgo(now - 2_000, now, 'fr')).toBe("à l'instant");
    expect(relativeAgo(now - 3 * 60_000, now, 'fr')).toBe(
      new Intl.RelativeTimeFormat('fr', { style: 'short', numeric: 'auto' }).format(-3, 'minute'),
    );
  });

  it('arabe : locale de formatage, chiffres latins (G Q71)', () => {
    const text = relativeAgo(now - 12 * 60_000, now, 'ar');
    expect(text).toContain('12');
    expect(text).not.toMatch(/[٠-٩]/);
  });
});
