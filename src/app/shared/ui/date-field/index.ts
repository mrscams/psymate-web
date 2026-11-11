// Point d'entrée des champs date et mois (UX-A4), séparé de shared/ui/index.ts : le barrel est chargé
// au démarrage, le datepicker Material ne doit arriver qu'avec les features qui l'utilisent.
export { DateFieldComponent, MonthFieldComponent } from './date-field.component';
export type { DateGranularity } from './date-text';
export { formatDateText, fromIsoDate, parseDateText, toIsoDate } from './date-text';
