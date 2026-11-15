import { LocationStrategy } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Router } from '@angular/router';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import {
  CalendarOptions,
  EventClickArg,
  EventDropArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core';
import enLocale from '@fullcalendar/core/locales/en-gb';
import frLocale from '@fullcalendar/core/locales/fr';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';

import {
  AgendaView,
  Appointment,
  BusyBlock,
  GRID_END_HOUR,
  GRID_START_HOUR,
  LIST_DAYS,
} from '../data/agenda.model';
import {
  busyName,
  formatSpacedTimeRange,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
  formatWeekdayShort,
  googleCalendarLabel,
  modalityLabel,
  statusLabel,
} from './agenda-format';

/** Vue de la barre d'outils → vue FullCalendar (la liste couvre 30 jours, fiche 15). */
const FC_VIEWS: Record<AgendaView, string> = {
  day: 'timeGridDay',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
  list: 'listThirty',
};

/** Au-delà, la case du mois dit « + n autres ». */
export const MONTH_CELL_MAX = 3;

/** Un rendez-vous déplacé ou étiré dans la grille : nouvelles bornes, ISO. */
export interface Rescheduled {
  id: string;
  startsAt: string;
  endsAt: string;
}

/** Ce que le gabarit d'un événement reçoit, calculé une fois par rendez-vous. */
interface EventProps {
  kind: 'appointment' | 'busy';
  appointment?: Appointment;
  /** Nom affiché (« Omar B. », « Appel · Inès V. »). */
  name: string;
  /** « · visio », « · à confirmer » après le nom ; null au cabinet planifié. */
  suffix: string | null;
  suffixKind: 'modality' | 'status' | null;
  /** Modalité en clair, masquée visuellement quand le suffixe ne la dit pas. */
  modality: string;
  /** « 09:00–09:50 » ; « 15:00 » pour un contact ; « 14:00 – 16:00 » pour un bloc Google. */
  time: string;
  /** « 09:00 » : heure de début seule (chips du mois). */
  startTime: string;
  /** Titre d'un bloc Google (« Occupé · Google Pro »). */
  busyTitle?: string;
  contact: boolean;
}

/**
 * Zone centrale de l'agenda sur FullCalendar (fiche 15 : cœur MIT + daygrid, timegrid, list,
 * interaction, locale fr), habillée par agenda-calendar.component.scss avec les tokens Nordique
 * (variables `--fc-*` et surcharges) pour reproduire la maquette 15 : 8 h → 19 h à 52 px par
 * heure, en-têtes « lun. 26 », événements teintés avec barre de modalité, « à confirmer » en
 * pointillé, sélection en fond plein, blocs « Occupé · Google » hachurés en événements de fond,
 * heures non travaillées (dimanche, vendredi et samedi après 13 h) hachurées par `businessHours`,
 * samedi teinté, ligne de l'heure courante. La barre d'outils est la nôtre (`headerToolbar`
 * désactivé) : la page donne la vue et la date d'ancrage, le composant les pousse à l'API du
 * calendrier. Glisser-déposer et redimensionnement (plugin interaction) remontent `rescheduled` ;
 * un clic sur un rendez-vous ouvre son détail (`/agenda/rdv/:id`), un double-clic le dossier, un
 * clic sur un créneau vide ou un jour du mois donne l'instant à la page.
 */
@Component({
  selector: 'pm-agenda-calendar',
  imports: [FullCalendarModule],
  templateUrl: './agenda-calendar.component.html',
  styleUrl: './agenda-calendar.component.scss',
  // Styles globaux sous `.pm-calendar` : FullCalendar rend hors de la vue Angular.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pm-calendar' },
})
export class AgendaCalendarComponent {
  readonly view = input.required<AgendaView>();
  readonly anchor = input.required<Date>();
  readonly appointments = input.required<readonly Appointment[]>();
  readonly busy = input<readonly BusyBlock[]>([]);
  readonly selectedId = input<string | null>(null);
  /** Double-clic sur un rendez-vous : le dossier du patient. */
  readonly opened = output<Appointment>();
  /** Clic sur un créneau vide (semaine, jour) : début du créneau. */
  readonly slotPicked = output<Date>();
  /** Clic sur un numéro de jour (mois) : la vue Jour. */
  readonly dayPicked = output<Date>();
  /** Rendez-vous déplacé ou étiré dans la grille. */
  readonly rescheduled = output<Rescheduled>();

  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);
  private readonly location = inject(LocationStrategy);
  private readonly calendar = viewChild(FullCalendarComponent);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly sundayLabel = $localize`:Colonne du dimanche, non travaillé@@agenda.grid.sunday:Dimanche, non travaillé`;

  /** Rendez-vous et blocs Google en événements FullCalendar. */
  protected readonly events = computed<EventInput[]>(() => {
    const selected = this.selectedId();
    const items: EventInput[] = this.appointments().map((appointment) => ({
      id: appointment.id,
      start: appointment.startsAt,
      end: appointment.endsAt,
      title: appointment.patient.displayName,
      url: this.hrefOf(appointment),
      classNames: [
        'rdv',
        appointment.modality,
        appointment.status,
        appointment.kind,
        ...(appointment.id === selected ? ['selected'] : []),
      ],
      extendedProps: this.propsOf(appointment),
    }));
    for (const block of this.busy()) {
      items.push({
        id: block.id,
        start: block.startsAt,
        end: block.endsAt,
        display: 'background',
        editable: false,
        classNames: ['busy', `google-${block.calendar}`],
        extendedProps: {
          kind: 'busy',
          name: busyName(block.startsAt, block.endsAt, block.calendar, this.locale),
          busyTitle: $localize`:Titre d'un bloc occupé Google dans la grille@@agenda.busy.title:Occupé · ${googleCalendarLabel(block.calendar)}:calendar:`,
          time: formatSpacedTimeRange(block.startsAt, block.endsAt, this.locale),
          startTime: formatTime(block.startsAt, this.locale),
          suffix: null,
          suffixKind: null,
          modality: '',
          contact: false,
        } satisfies EventProps,
      });
    }
    return items;
  });

  private built: CalendarOptions | null = null;

  /**
   * Options fixes du calendrier, construites au premier rendu (les entrées sont alors connues) ;
   * la vue, la date et les événements suivent ensuite les entrées.
   */
  protected get options(): CalendarOptions {
    return (this.built ??= this.buildOptions());
  }

  private buildOptions(): CalendarOptions {
    return {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      locale: this.locale.startsWith('en') ? enLocale : frLocale,
      headerToolbar: false,
      initialView: FC_VIEWS[untracked(() => this.view())],
      initialDate: untracked(() => this.anchor()),
      firstDay: 1,
      height: 'auto',
      expandRows: false,
      allDaySlot: false,
      slotMinTime: `${String(GRID_START_HOUR).padStart(2, '0')}:00:00`,
      slotMaxTime: `${String(GRID_END_HOUR).padStart(2, '0')}:00:00`,
      slotDuration: '00:30:00',
      slotLabelInterval: '01:00',
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      slotEventOverlap: false,
      nowIndicator: true,
      // Heures travaillées (démonstration, fiche 15 §4) : lundi à jeudi 8 h–19 h, vendredi et
      // samedi jusqu'à 13 h, rien le dimanche ; le reste est hachuré (`.fc-non-business`).
      businessHours: [
        { daysOfWeek: [1, 2, 3, 4], startTime: '08:00', endTime: '19:00' },
        { daysOfWeek: [5, 6], startTime: '08:00', endTime: '13:00' },
      ],
      editable: true,
      eventStartEditable: true,
      eventDurationEditable: true,
      eventResizableFromStart: false,
      dragRevertDuration: 120,
      // Mois : autant de semaines que le mois en compte (cinq pour octobre 2026), comme le modèle.
      fixedWeekCount: false,
      navLinks: true,
      navLinkDayClick: (date) => this.dayPicked.emit(date),
      dayMaxEvents: MONTH_CELL_MAX,
      moreLinkClick: 'day',
      views: {
        timeGridWeek: { dayHeaderFormat: { weekday: 'short', day: 'numeric' } },
        timeGridDay: { dayHeaderFormat: { weekday: 'short', day: 'numeric' } },
        dayGridMonth: { dayHeaderFormat: { weekday: 'short' }, eventDisplay: 'block' },
        listThirty: {
          type: 'list',
          duration: { days: LIST_DAYS },
          listDayFormat: { weekday: 'long', day: 'numeric', month: 'long' },
          listDaySideFormat: false,
        },
      },
      // FullCalendar nomme chaque case du mois par son seul numéro (aria-labelledby) alors qu'elle
      // contient les rendez-vous : axe le refuse ; sans l'attribut, la case se nomme par son contenu.
      dayCellDidMount: (arg) => arg.el.removeAttribute('aria-labelledby'),
      eventClick: (arg) => this.onEventClick(arg),
      eventDidMount: (arg) => this.onEventMount(arg),
      eventDrop: (arg) => this.onMoved(arg),
      eventResize: (arg) => this.onMoved(arg),
      dateClick: (arg) => this.onDateClick(arg),
    };
  }

  constructor() {
    // FullCalendar met les classes à jour sans remonter l'élément : `aria-current` suit la sélection.
    afterRenderEffect(() => {
      this.selectedId();
      this.appointments();
      const host = untracked(() => this.element.nativeElement);
      for (const el of host.querySelectorAll('.fc-event[aria-current]')) {
        el.removeAttribute('aria-current');
      }
      host.querySelector('.fc-event.selected')?.setAttribute('aria-current', 'true');
    });
    // La page change de vue ou de date : le calendrier suit, sans se reconstruire.
    afterRenderEffect(() => {
      const view = FC_VIEWS[this.view()];
      const anchor = this.anchor();
      const api = untracked(() => this.calendar()?.getApi());
      if (!api) return;
      if (api.view.type !== view) api.changeView(view, anchor);
      else api.gotoDate(anchor);
    });
  }

  /** Le gabarit lit les propriétés calculées de l'événement. */
  protected propsFrom(arg: { event: { extendedProps: Record<string, unknown> } }): EventProps {
    return arg.event.extendedProps as unknown as EventProps;
  }

  /** « lun. » : jour de la semaine abrégé de l'en-tête. */
  protected weekdayOf(date: Date): string {
    return formatWeekdayShort(date, this.locale);
  }

  /** « Samedi 31 octobre » : en-tête d'un jour de la vue Liste. */
  protected listDayOf(date: Date): string {
    return formatWeekdayDate(date, this.locale);
  }

  protected moreLabel(count: number): string {
    return $localize`:Vue mois, rendez-vous non affichés dans la case@@agenda.month.more:+ ${count}:count: autres`;
  }

  private propsOf(appointment: Appointment): EventProps {
    const contact = appointment.kind === 'contact';
    const status = statusLabel(appointment.status);
    const modality = modalityLabel(appointment.modality);
    const suffix = status ?? (contact || appointment.modality === 'in_person' ? null : modality);
    return {
      kind: 'appointment',
      appointment,
      name: contact
        ? $localize`:Contact téléphonique dans la grille@@agenda.grid.call:Appel · ${appointment.patient.displayName}:name:`
        : appointment.patient.displayName,
      suffix,
      suffixKind: status ? 'status' : suffix ? 'modality' : null,
      modality,
      time: contact
        ? formatTime(appointment.startsAt, this.locale)
        : formatTimeRange(appointment.startsAt, appointment.endsAt, this.locale),
      startTime: formatTime(appointment.startsAt, this.locale),
      contact,
    };
  }

  /** `/fr/agenda/rdv/:id` avec la requête courante (vue, date) : le lien reste un vrai lien. */
  private hrefOf(appointment: Appointment): string {
    const tree = this.router.createUrlTree(['/agenda', 'rdv', appointment.id], {
      queryParams: this.router.routerState.snapshot.root.queryParams,
    });
    return this.location.prepareExternalUrl(this.router.serializeUrl(tree));
  }

  private onEventClick(arg: EventClickArg): void {
    arg.jsEvent.preventDefault();
    const props = this.propsFrom(arg);
    if (props.kind !== 'appointment' || !props.appointment) return;
    void this.router.navigate(['/agenda', 'rdv', props.appointment.id], {
      queryParamsHandling: 'preserve',
    });
  }

  private onEventMount(arg: EventMountArg): void {
    const props = this.propsFrom(arg);
    if (props.kind === 'busy') {
      arg.el.setAttribute('role', 'img');
      arg.el.setAttribute('aria-label', props.name);
      return;
    }
    if (arg.event.classNames.includes('selected')) arg.el.setAttribute('aria-current', 'true');
    arg.el.addEventListener('dblclick', () => {
      if (props.appointment) this.opened.emit(props.appointment);
    });
  }

  private onMoved(arg: EventDropArg | EventResizeDoneArg): void {
    const { start, end } = arg.event;
    if (!start || !end) {
      arg.revert();
      return;
    }
    this.rescheduled.emit({
      id: arg.event.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
  }

  private onDateClick(arg: DateClickArg): void {
    if (arg.view.type === 'dayGridMonth') {
      this.dayPicked.emit(arg.date);
      return;
    }
    if (arg.allDay) return;
    this.slotPicked.emit(arg.date);
  }
}
