import {
  APP_LOCALES,
  localeName,
  localeSwitchHref,
  OFFERED_LOCALES,
  switchLocales,
  textDirection,
  toAppLocale,
  toOfferedLocale,
} from './locales';

describe('locales', () => {
  it('ramène toute locale inconnue au français (langue source)', () => {
    expect(toAppLocale('fr')).toBe('fr');
    expect(toAppLocale('fr-CA')).toBe('fr');
    expect(toAppLocale('en-US')).toBe('en');
    expect(toAppLocale('de')).toBe('fr');
  });

  it("reconnaît l'arabe, troisième langue construite (M16-08)", () => {
    expect(APP_LOCALES).toEqual(['fr', 'en', 'ar']);
    expect(toAppLocale('ar')).toBe('ar');
    expect(toAppLocale('ar-MA')).toBe('ar');
    expect(toAppLocale('AR-eg')).toBe('ar');
    expect(toAppLocale('ar-u-nu-latn-ca-gregory')).toBe('ar');
    expect(toAppLocale('arn')).toBe('fr');
  });

  it("propose les trois langues depuis l'ouverture de l'arabe (M16-29, Q80)", () => {
    expect(OFFERED_LOCALES).toEqual(['fr', 'en', 'ar']);
    expect(toOfferedLocale('fr')).toBe('fr');
    expect(toOfferedLocale('en')).toBe('en');
    expect(toOfferedLocale('ar')).toBe('ar');
  });

  it('donne les autres langues proposées, sans la courante, dans l’ordre fr, en, ar', () => {
    expect(switchLocales('fr')).toEqual(['en', 'ar']);
    expect(switchLocales('en')).toEqual(['fr', 'ar']);
    expect(switchLocales('ar')).toEqual(['fr', 'en']);
  });

  it('nomme chaque langue dans sa propre langue (source des trois bundles)', () => {
    expect(localeName('fr')).toBe('Français');
    expect(localeName('en')).toBe('English');
    expect(localeName('ar')).toBe('العربية');
  });

  it('sens de lecture : de droite à gauche en arabe seulement (Q74)', () => {
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('ar-EG')).toBe('rtl');
    expect(textDirection('fr')).toBe('ltr');
    expect(textDirection('en-US')).toBe('ltr');
  });

  it.each([
    ['/fr/', '/', 'en', '/en/'],
    ['/fr/', '/patients?archived=true', 'en', '/en/patients?archived=true'],
    ['/en/', '/patients/42/timeline', 'fr', '/fr/patients/42/timeline'],
    ['/fr', '/', 'en', '/en/'],
    ['/', '/', 'en', '/en/'],
    ['/app/fr/', '/compte', 'en', '/app/en/compte'],
    ['/fr/', '/patients', 'ar', '/ar/patients'],
    ['/ar/', '/patients/42/timeline', 'fr', '/fr/patients/42/timeline'],
    ['/ar/', '/', 'en', '/en/'],
    ['/app/ar/', '/compte', 'en', '/app/en/compte'],
  ] as const)('base %s, url %s → %s : %s', (base, url, target, expected) => {
    expect(localeSwitchHref(base, url, target)).toBe(expected);
  });
});
