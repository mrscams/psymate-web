import { Injectable } from '@angular/core';
import { MatDateFormats, NativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';

import { toAppLocale } from '../../../core/i18n';
import { DateGranularity, formatDateText, parseDateText } from './date-text';

/** Formats symboliques compris par PmDateAdapter (le reste passe à Intl comme NativeDateAdapter). */
const INPUT_FORMAT: Record<DateGranularity, string> = { day: 'pm-day', month: 'pm-month' };

function granularityOf(format: unknown): DateGranularity | null {
  if (format === INPUT_FORMAT.day) return 'day';
  if (format === INPUT_FORMAT.month) return 'month';
  return null;
}

/**
 * Adaptateur natif de Material (aucune dépendance de date) qui sait lire et écrire la saisie
 * numérique de la locale (MAT_DATE_LOCALE, par défaut LOCALE_ID) : « 28/07/2003 » en fr,
 * « 07/28/2003 » en en ; semaine du lundi en fr. Fourni par pm-date-field et pm-month-field
 * seulement, pas à la racine.
 */
@Injectable()
export class PmDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    const granularity = granularityOf(parseFormat);
    if (granularity && typeof value === 'string') {
      if (!value.trim()) return null;
      return parseDateText(value, this.locale, granularity) ?? this.invalid();
    }
    return super.parse(value, parseFormat);
  }

  override format(date: Date, displayFormat: object): string {
    const granularity = granularityOf(displayFormat);
    if (granularity) {
      if (!this.isValid(date)) throw Error('PmDateAdapter: Cannot format invalid date.');
      return formatDateText(date, this.locale, granularity);
    }
    return super.format(date, displayFormat);
  }

  override getFirstDayOfWeek(): number {
    return toAppLocale(String(this.locale)) === 'fr' ? 1 : 0;
  }
}

const DISPLAY = {
  monthYearLabel: { year: 'numeric', month: 'short' },
  dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
  monthYearA11yLabel: { year: 'numeric', month: 'long' },
} as const;

export const PM_DAY_FORMATS: MatDateFormats = {
  parse: { dateInput: INPUT_FORMAT.day },
  display: { dateInput: INPUT_FORMAT.day, ...DISPLAY },
};

export const PM_MONTH_FORMATS: MatDateFormats = {
  parse: { dateInput: INPUT_FORMAT.month },
  display: { dateInput: INPUT_FORMAT.month, ...DISPLAY },
};

/** Libellés du calendrier Material, traduits ($localize) au lieu de l'anglais par défaut. */
@Injectable()
export class PmDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = $localize`:Calendrier du champ date@@shared.dateField.calendar:Calendrier`;
  override openCalendarLabel = $localize`:Bouton du champ date@@shared.dateField.open:Ouvrir le calendrier`;
  override closeCalendarLabel = $localize`:Bouton du calendrier@@shared.dateField.close:Fermer le calendrier`;
  override prevMonthLabel = $localize`:Calendrier@@shared.dateField.prevMonth:Mois précédent`;
  override nextMonthLabel = $localize`:Calendrier@@shared.dateField.nextMonth:Mois suivant`;
  override prevYearLabel = $localize`:Calendrier@@shared.dateField.prevYear:Année précédente`;
  override nextYearLabel = $localize`:Calendrier@@shared.dateField.nextYear:Année suivante`;
  override prevMultiYearLabel = $localize`:Calendrier@@shared.dateField.prevYears:24 années précédentes`;
  override nextMultiYearLabel = $localize`:Calendrier@@shared.dateField.nextYears:24 années suivantes`;
  override switchToMonthViewLabel = $localize`:Calendrier@@shared.dateField.toMonthView:Choisir la date`;
  override switchToMultiYearViewLabel = $localize`:Calendrier@@shared.dateField.toYearView:Choisir le mois et l'année`;
}
