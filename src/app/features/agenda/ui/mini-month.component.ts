import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';

import {
  addDays,
  addMonths,
  AgendaRange,
  daysOf,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toIsoDay,
} from '../data/agenda.model';
import { formatMonthTitle, formatWeekdayDate, weekdayInitials } from './agenda-format';

interface MiniDay {
  date: Date;
  label: string;
  iso: string;
  outside: boolean;
  sunday: boolean;
  today: boolean;
  /** Dans la plage affichée par la grille : teinte primaire, arrondie aux extrémités. */
  inRange: boolean;
  rangeStart: boolean;
  rangeEnd: boolean;
}

/**
 * Mini-mois du rail gauche (fiche 15 §3, maquette) : en-tête « Octobre 2026 » avec ‹ ›, initiales
 * des jours, chiffres en JetBrains Mono ; aujourd'hui en noir, la plage affichée en teinte
 * primaire, les jours des mois voisins estompés, les dimanches en gris. Un clic sur un jour le
 * donne à la page, qui y amène la vue. Le mois montré suit la date d'ancrage, puis se feuillette
 * seul avec ‹ ›.
 */
@Component({
  selector: 'pm-mini-month',
  template: `
    <div class="head">
      <span class="month" aria-live="polite">{{ title() }}</span>
      <span class="arrows">
        <button type="button" [attr.aria-label]="prevLabel" (click)="shift(-1)">‹</button>
        <button type="button" [attr.aria-label]="nextLabel" (click)="shift(1)">›</button>
      </span>
    </div>
    <div class="weekdays" aria-hidden="true">
      @for (letter of initials; track $index) {
        <span>{{ letter }}</span>
      }
    </div>
    <div class="days">
      @for (day of days(); track day.iso) {
        <button
          type="button"
          class="day"
          [class.outside]="day.outside"
          [class.sunday]="day.sunday"
          [class.today]="day.today"
          [class.in-range]="day.inRange"
          [class.range-start]="day.rangeStart"
          [class.range-end]="day.rangeEnd"
          [attr.aria-label]="dayName(day)"
          [attr.aria-current]="day.today ? 'date' : null"
          (click)="picked.emit(day.date)"
        >
          {{ day.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './mini-month.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniMonthComponent {
  /** Date d'ancrage de la vue : le mois montré la suit. */
  readonly anchor = input.required<Date>();
  /** Plage affichée par la grille, surlignée. */
  readonly range = input.required<AgendaRange>();
  readonly today = input<Date>(new Date());
  readonly picked = output<Date>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly initials = weekdayInitials(this.locale);
  protected readonly prevLabel = $localize`:Mini-mois, mois précédent@@agenda.miniMonth.prev:Mois précédent`;
  protected readonly nextLabel = $localize`:Mini-mois, mois suivant@@agenda.miniMonth.next:Mois suivant`;

  /** Premier jour du mois montré (feuilleté par ‹ ›, réaligné quand l'ancrage change). */
  private readonly month = signal(startOfMonth(new Date()));

  constructor() {
    effect(() => this.month.set(startOfMonth(this.anchor())));
  }

  protected readonly title = computed(() => formatMonthTitle(this.month(), this.locale));

  protected readonly days = computed<MiniDay[]>(() => {
    const month = this.month();
    const range = this.range();
    const today = startOfDay(this.today());
    const first = startOfWeek(month);
    const last = addDays(startOfWeek(addDays(addMonths(month, 1), -1)), 7);
    const lastInRange = addDays(range.to, -1);
    return daysOf({ from: first, to: last }).map((date) => {
      const inRange = date >= range.from && date < range.to;
      return {
        date,
        label: String(date.getDate()),
        iso: toIsoDay(date),
        outside: date.getMonth() !== month.getMonth(),
        sunday: date.getDay() === 0,
        today: sameDay(date, today),
        inRange,
        rangeStart: inRange && sameDay(date, range.from),
        rangeEnd: inRange && sameDay(date, lastInRange),
      };
    });
  });

  protected dayName(day: MiniDay): string {
    const name = formatWeekdayDate(day.date, this.locale);
    return day.today
      ? $localize`:Mini-mois, jour d'aujourd'hui@@agenda.miniMonth.today:Aujourd'hui, ${name}:date:`
      : name;
  }

  protected shift(months: 1 | -1): void {
    this.month.update((current) => addMonths(current, months));
  }
}
