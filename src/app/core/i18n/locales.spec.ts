import { localeSwitchHref, otherLocale, toAppLocale } from './locales';

describe('locales', () => {
  it('ramène toute locale inconnue au français (langue source)', () => {
    expect(toAppLocale('fr')).toBe('fr');
    expect(toAppLocale('fr-CA')).toBe('fr');
    expect(toAppLocale('en-US')).toBe('en');
    expect(toAppLocale('de')).toBe('fr');
  });

  it("donne l'autre langue", () => {
    expect(otherLocale('fr')).toBe('en');
    expect(otherLocale('en')).toBe('fr');
  });

  it.each([
    ['/fr/', '/', 'en', '/en/'],
    ['/fr/', '/patients?archived=true', 'en', '/en/patients?archived=true'],
    ['/en/', '/patients/42/timeline', 'fr', '/fr/patients/42/timeline'],
    ['/fr', '/', 'en', '/en/'],
    ['/', '/', 'en', '/en/'],
    ['/app/fr/', '/compte', 'en', '/app/en/compte'],
  ] as const)('base %s, url %s → %s : %s', (base, url, target, expected) => {
    expect(localeSwitchHref(base, url, target)).toBe(expected);
  });
});
