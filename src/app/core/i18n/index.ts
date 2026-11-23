// Surface de core/i18n (fiche 00, handbook §9) : langues construites et proposées, locale de
// formatage et sens de lecture (Q73, Q74), libellés de catalogue (Q78), formats Intl, désignation
// patient / client.
export {
  ageInYears,
  formatDate,
  formatDateTime,
  formatDelay,
  formatMinutes,
  formatMonthYear,
  formatRelativeDay,
  minutesBetween,
} from './formats';
export type { DateStyle } from './formats';
export type { CatalogLabels } from './catalog-label';
export { catalogLabel } from './catalog-label';
export type { AppLocale, OfferedLocale, TextDirection } from './locales';
export {
  APP_LOCALES,
  ARABIC_FORMAT_LOCALE,
  formatLocale,
  localeSwitchHref,
  OFFERED_LOCALES,
  switchLocales,
  textDirection,
  toAppLocale,
  toOfferedLocale,
} from './locales';
export type { SubjectForm, SubjectLabel } from './subject-label';
export { subjectLabel, SubjectLabelPipe, SubjectVocabulary } from './subject-label';
