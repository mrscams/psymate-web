import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Appointment, sameDay, startOfDay, toIsoDay } from '../data/agenda.model';
import { formatTime, formatWeekdayDate, modalityLabel, weekdayInitials } from './agenda-format';

/** Au-delà, la case dit « + n autres » (le clic sur la case ouvre le jour). */
export const MONTH_CELL_MAX = 3;

interface MonthCell {
  date: Date;
  iso: string;
  number: string;
  name: string;
  outside: boolean;
  today: boolean;
  sunday: boolean;
  events: Appointment[];
  more: number;
}

/**
 * Vue Mois (fiche 15 §2) : six semaines au plus, du lundi au dimanche, les jours du mois voisin
 * estompés ; dans chaque case, les rendez-vous du jour (heure mono, nom, barre de la modalité)
 * jusqu'à trois, puis « + n autres » ; un clic sur le numéro du jour ouvre la vue Jour.
 */
@Component({
  selector: 'pm-month-grid',
  imports: [RouterLink],
  template: `
    <div class="weekdays">
      @for (letter of weekdays; track $index) {
        <div>{{ letter }}</div>
      }
    </div>
    <div class="cells">
      @for (cell of cells(); track cell.iso) {
        <div
          class="cell"
          [class.outside]="cell.outside"
          [class.sunday]="cell.sunday"
          [class.today]="cell.today"
        >
          <button
            type="button"
            class="number"
            [attr.aria-label]="cell.name"
            [attr.aria-current]="cell.today ? 'date' : null"
            (click)="dayPicked.emit(cell.date)"
          >
            {{ cell.number }}
          </button>
          <ul>
            @for (event of cell.events; track event.id) {
              <li>
                <a
                  class="chip"
                  [class]="'chip ' + event.modality"
                  [class.tentative]="event.status === 'tentative'"
                  [class.selected]="event.id === selectedId()"
                  [routerLink]="['/agenda', 'rdv', event.id]"
                  queryParamsHandling="preserve"
                  [attr.aria-current]="event.id === selectedId() ? 'true' : null"
                >
                  <span class="time">{{ time(event) }}</span>
                  <span class="who">{{ event.patient.displayName }}</span>
                  <span class="sr-only"> · {{ modality(event) }}</span>
                </a>
              </li>
            }
          </ul>
          @if (cell.more > 0) {
            <button type="button" class="more" (click)="dayPicked.emit(cell.date)">
              {{ moreLabel(cell.more) }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './month-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthGridComponent {
  readonly days = input.required<readonly Date[]>();
  /** Mois affiché (premier jour) : les autres jours sont estompés. */
  readonly month = input.required<Date>();
  readonly appointments = input.required<readonly Appointment[]>();
  readonly selectedId = input<string | null>(null);
  readonly today = input<Date>(new Date());
  readonly dayPicked = output<Date>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly weekdays = weekdayInitials(this.locale);

  protected readonly cells = computed<MonthCell[]>(() => {
    const today = startOfDay(this.today());
    const month = this.month().getMonth();
    return this.days().map((date) => {
      const events = this.appointments().filter((item) => sameDay(new Date(item.startsAt), date));
      return {
        date,
        iso: toIsoDay(date),
        number: String(date.getDate()),
        name: formatWeekdayDate(date, this.locale),
        outside: date.getMonth() !== month,
        today: sameDay(date, today),
        sunday: date.getDay() === 0,
        events: events.slice(0, MONTH_CELL_MAX),
        more: Math.max(0, events.length - MONTH_CELL_MAX),
      };
    });
  });

  protected time(event: Appointment): string {
    return formatTime(event.startsAt, this.locale);
  }

  protected modality(event: Appointment): string {
    return modalityLabel(event.modality);
  }

  protected moreLabel(count: number): string {
    return $localize`:Vue mois, rendez-vous non affichés dans la case@@agenda.month.more:+ ${count}:count: autres`;
  }
}
