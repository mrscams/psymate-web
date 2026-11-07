/** Langues livrées : un bundle par langue, servi sous /fr/ et /en/ (angular.json, i18n). */
export const APP_LOCALES = ['fr', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

/** Le français est la langue source (G Q23) : toute locale inconnue retombe sur fr. */
export function toAppLocale(localeId: string): AppLocale {
  return localeId.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function otherLocale(locale: AppLocale): AppLocale {
  return locale === 'fr' ? 'en' : 'fr';
}

/**
 * Adresse de la même page dans l'autre langue.
 * Les deux langues sont deux bundles distincts : la bascule est une navigation complète
 * vers le sous-chemin de l'autre locale, en gardant la route courante.
 *
 * @param baseHref base href du bundle courant (ex. « /fr/ »)
 * @param routerUrl URL du routeur Angular, relative à la base (ex. « /patients?archived=true »)
 */
export function localeSwitchHref(baseHref: string, routerUrl: string, target: AppLocale): string {
  const base = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  const segment = new RegExp(`/(${APP_LOCALES.join('|')})/$`);
  const targetBase = segment.test(base)
    ? base.replace(segment, `/${target}/`)
    : `${base}${target}/`;
  const path = routerUrl.startsWith('/') ? routerUrl.slice(1) : routerUrl;
  return `${targetBase}${path}`;
}
