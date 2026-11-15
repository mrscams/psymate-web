import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Appointment, sameDay, startOfDay, toIsoDay } from '../data/agenda.model';
import { formatTimeRange, formatWeekdayDate, modalityLabel, statusLabel } from './agenda-format';

interface ListDay {
  iso: string;
  title: string;
  today: boolean;
  events: Appointment[];
}

/**
 * Vue Liste (fiche 15 : les 30 prochains jours, groupés par jour, même panneau de détail) :
 * l'alternative complète à la grille pour les lecteurs d'écran et le mobile. Un jour sans
 * rendez-vous n'apparaît pas ; la page montre l'état vide quand la liste entière l'est.
 */
@Component({
  selector: 'pm-agenda-list',
  imports: [RouterLink],
  template: `
    @for (day of days(); track day.iso) {
      <section class="day" [attr.aria-labelledby]="'agenda-day-' + day.iso">
        <h3 [id]="'agenda-day-' + day.iso" [class.today]="day.today">
          {{ day.title }}
          @if (day.today) {
            <span class="today-tag" i18n="Étiquette du jour dans la vue liste@@agenda.list.today"
              >aujourd'hui</span
            >
          }
        </h3>
        <ul>
          @for (event of day.events; track event.id) {
            <li>
              <a
                class="row"
                [class.selected]="event.id === selectedId()"
                [routerLink]="['/agenda', 'rdv', event.id]"
                queryParamsHandling="preserve"
                [attr.aria-current]="event.id === selectedId() ? 'true' : null"
              >
                <span class="bar" [class]="'bar ' + event.modality" aria-hidden="true"></span>
                <span class="time">{{ time(event) }}</span>
                <span class="who">{{ event.patient.displayName }}</span>
                <span class="meta">
                  {{ modality(event) }}
                  @if (status(event); as text) {
                    <span class="status">· {{ text }}</span>
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './agenda-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaListComponent {
  readonly appointments = input.required<readonly Appointment[]>();
  readonly selectedId = input<string | null>(null);
  readonly today = input<Date>(new Date());

  private readonly locale = inject(LOCALE_ID);

  protected readonly days = computed<ListDay[]>(() => {
    const today = startOfDay(this.today());
    const groups = new Map<string, ListDay>();
    for (const event of this.appointments()) {
      const date = startOfDay(new Date(event.startsAt));
      const iso = toIsoDay(date);
      let group = groups.get(iso);
      if (!group) {
        group = {
          iso,
          title: formatWeekdayDate(date, this.locale),
          today: sameDay(date, today),
          events: [],
        };
        groups.set(iso, group);
      }
      group.events.push(event);
    }
    return [...groups.values()];
  });

  protected time(event: Appointment): string {
    return formatTimeRange(event.startsAt, event.endsAt, this.locale);
  }

  protected modality(event: Appointment): string {
    return modalityLabel(event.modality);
  }

  protected status(event: Appointment): string | null {
    return statusLabel(event.status);
  }
}
