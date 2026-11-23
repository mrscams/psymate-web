/**
 * Langues construites : un bundle par langue, servi sous /fr/, /en/ et /ar/ (angular.json, i18n).
 * L'arabe (G Q71, Q72) a été construit et testé dès le socle (M16-08), puis ouvert par M16-29 (Q80).
 */
export const APP_LOCALES = ['fr', 'en', 'ar'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

/**
 * Langues proposées : celles des sélecteurs de langue, des liens vers les autres langues et des
 * alternatives hreflang des pages publiques. Depuis l'ouverture de l'arabe (M16-29, Q80), toutes les
 * langues construites ; le contrat 0.16.0 (M16-25) admet ar pour la préférence `locale` et la langue
 * d'une demande de rendez-vous. La liste reste distincte d'APP_LOCALES : une langue future peut être
 * construite avant d'être proposée, comme l'arabe pendant le jalon M16.
 */
export const OFFERED_LOCALES = ['fr', 'en', 'ar'] as const satisfies readonly AppLocale[];

export type OfferedLocale = (typeof OFFERED_LOCALES)[number];

/** Le français est la langue source (G Q23) : toute locale inconnue retombe sur fr. */
export function toAppLocale(localeId: string): AppLocale {
  const id = localeId.toLowerCase();
  if (id.startsWith('en')) return 'en';
  if (id === 'ar' || id.startsWith('ar-') || id.startsWith('ar_')) return 'ar';
  return 'fr';
}

/** Langue proposée la plus proche : elle-même si elle est proposée, sinon le français (langue source). */
export function toOfferedLocale(locale: AppLocale): OfferedLocale {
  return (OFFERED_LOCALES as readonly AppLocale[]).includes(locale)
    ? (locale as OfferedLocale)
    : 'fr';
}

/**
 * Langues vers lesquelles un lien « autre langue » peut mener depuis le bundle courant : les
 * langues proposées, sauf la courante, dans l'ordre d'OFFERED_LOCALES (en /fr/ : English puis
 * العربية ; en /en/ : Français puis العربية ; en /ar/ : Français puis English).
 */
export function switchLocales(current: AppLocale): OfferedLocale[] {
  return OFFERED_LOCALES.filter((locale) => locale !== current);
}

/** Un lien du sélecteur de langue : la langue visée et l'adresse de la même page dans ce bundle. */
export interface LocaleLink {
  locale: AppLocale;
  href: string;
}

/**
 * Nom d'une langue, écrit dans cette langue (Français, English, العربية), le même dans les trois
 * bundles : c'est ainsi qu'un lecteur reconnaît la sienne. L'élément qui l'affiche porte
 * `lang` et `dir` de cette langue (textDirection), pour les lecteurs d'écran et axe-core.
 */
export function localeName(locale: AppLocale): string {
  switch (locale) {
    case 'fr':
      return $localize`:Nom du français, écrit en français, identique dans toutes les langues@@app.localeName.fr:Français`;
    case 'en':
      return $localize`:Nom de l'anglais, écrit en anglais, identique dans toutes les langues@@app.localeName.en:English`;
    case 'ar':
      return $localize`:Nom de l'arabe, écrit en arabe, identique dans toutes les langues@@app.localeName.ar:العربية`;
  }
}

/**
 * Locale de formatage (Q73) : celle que reçoivent Intl et les bibliothèques. En arabe, chiffres
 * latins et calendrier grégorien quel que soit le pays (G Q71), heures sur 24 h comme en français
 * (docs/design/arabe.md §7) ; ailleurs, la locale reçue, inchangée. Forme canonique BCP 47 :
 * clés d'extension dans l'ordre alphabétique (ca, hc, nu).
 */
export const ARABIC_FORMAT_LOCALE = 'ar-u-ca-gregory-hc-h23-nu-latn';

export function formatLocale(localeId: string): string {
  return toAppLocale(localeId) === 'ar' ? ARABIC_FORMAT_LOCALE : localeId;
}

export type TextDirection = 'ltr' | 'rtl';

/** Sens de lecture du bundle (Q74) : de droite à gauche en arabe, de gauche à droite sinon. */
export function textDirection(localeId: string): TextDirection {
  return toAppLocale(localeId) === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Adresse de la même page dans une autre langue.
 * Chaque langue est un bundle distinct : la bascule est une navigation complète vers le
 * sous-chemin de la locale cible, en gardant la route courante.
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
