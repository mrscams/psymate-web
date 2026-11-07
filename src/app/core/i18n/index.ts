// Surface de core/i18n (fiche 00, handbook §9) : langues livrées, formats Intl, désignation
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
export type { AppLocale } from './locales';
export { APP_LOCALES, localeSwitchHref, otherLocale, toAppLocale } from './locales';
export type { SubjectForm, SubjectLabel } from './subject-label';
export { subjectLabel, SubjectLabelPipe, SubjectVocabulary } from './subject-label';
