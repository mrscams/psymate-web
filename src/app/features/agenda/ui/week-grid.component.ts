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

import {
  Appointment,
  BusyBlock,
  durationMin,
  GRID_END_HOUR,
  GRID_START_HOUR,
  gridTop,
  HOUR_PX,
  isWorkedSaturday,
  minutesOfDay,
  offHours,
  sameDay,
  startOfDay,
  toIsoDay,
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

/** Hauteur d'un contact téléphonique (bandeau fin, fiche 15 §4). */
export const CONTACT_HEIGHT_PX = 14;

/** Pas d'arrondi d'un clic sur un créneau vide : la demi-heure. */
export const SLOT_STEP_MIN = 30;

interface GridEvent {
  appointment: Appointment;
  top: number;
  height: number;
  name: string;
  time: string;
  /** « · visio », « · à confirmer » après le nom (vide au cabinet, planifié). */
  suffix: string | null;
  suffixKind: 'modality' | 'status' | null;
  /** Modalité en clair, lue par le lecteur d'écran quand le suffixe ne la montre pas. */
  modality: string;
  contact: boolean;
  selected: boolean;
}

interface GridBusy {
  block: BusyBlock;
  top: number;
  height: number;
  title: string;
  time: string;
  name: string;
}

interface GridColumn {
  date: Date;
  iso: string;
  weekday: string;
  number: string;
  longName: string;
  saturday: boolean;
  sunday: boolean;
  today: boolean;
  off: { top: number; height: number } | null;
  events: GridEvent[];
  busy: GridBusy[];
  /** Ligne de l'heure courante (px), quand la colonne est aujourd'hui dans les heures de la grille. */
  now: number | null;
}

/**
 * Grille horaire (fiche 15 §4, maquette) : 56 px d'heures puis une colonne par jour (sept pour la
 * semaine, une pour le jour), 8 h → 19 h à 52 px par heure, lignes d'heures en fond. Les
 * rendez-vous sont des liens vers `/agenda/rdv/:id` (fond teinte + barre gauche de la modalité,
 * nom et heures mono ; « à confirmer » en pointillé ; sélectionné = fond plein, texte blanc, halo
 * teinte, `aria-current`) ; un contact téléphonique est un bandeau de 14 px. Les blocs « Occupé ·
 * Google » sont hachurés, `role="img"` nommés. Le samedi travaillé est teinté, le dimanche et les
 * demi-journées non travaillées hachurés clair. La ligne de l'heure courante est en primaire quand
 * la plage contient aujourd'hui. Un clic sur un créneau vide donne l'instant (à la demi-heure) à la
 * page, qui ouvre « Nouveau rendez-vous » ; un double-clic sur un rendez-vous ouvre le dossier.
 */
@Component({
  selector: 'pm-week-grid',
  imports: [RouterLink],
  templateUrl: './week-grid.component.html',
  styleUrl: './week-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--columns]': 'days().length',
    // Clic sur un créneau vide (souris) : la colonne et la hauteur donnent l'instant. Au clavier,
    // « + Rendez-vous » de la barre d'outils ouvre le même panneau.
    '(click)': 'onClick($event)',
  },
})
export class WeekGridComponent {
  readonly days = input.required<readonly Date[]>();
  readonly appointments = input.required<readonly Appointment[]>();
  readonly busy = input<readonly BusyBlock[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly now = input<Date>(new Date());
  /** Double-clic sur un rendez-vous : le dossier du patient. */
  readonly opened = output<Appointment>();
  /** Clic sur un créneau vide : début du créneau, à la demi-heure. */
  readonly slotPicked = output<Date>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly hourHeight = HOUR_PX;
  protected readonly bodyHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_PX;
  protected readonly hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => {
    const hour = GRID_START_HOUR + index;
    const date = new Date(2024, 0, 1, hour);
    return { top: index * HOUR_PX, label: formatTime(date, this.locale) };
  });
  protected readonly busyTitle = (block: BusyBlock) =>
    $localize`:Titre d'un bloc occupé Google dans la grille@@agenda.busy.title:Occupé · ${googleCalendarLabel(block.calendar)}:calendar:`;
  protected readonly sundayLabel = $localize`:Colonne du dimanche, non travaillé@@agenda.grid.sunday:Dimanche, non travaillé`;
  protected readonly nowLabel = $localize`:Ligne de l'heure courante@@agenda.grid.now:Heure actuelle`;

  protected readonly columns = computed<GridColumn[]>(() => {
    const now = this.now();
    const today = startOfDay(now);
    const selected = this.selectedId();
    return this.days().map((date) => {
      const isToday = sameDay(date, today);
      const off = offHours(date);
      const nowMinutes = minutesOfDay(now);
      const inHours = nowMinutes >= GRID_START_HOUR * 60 && nowMinutes <= GRID_END_HOUR * 60;
      return {
        date,
        iso: toIsoDay(date),
        weekday: formatWeekdayShort(date, this.locale),
        number: String(date.getDate()),
        longName: formatWeekdayDate(date, this.locale),
        saturday: isWorkedSaturday(date),
        sunday: date.getDay() === 0,
        today: isToday,
        off: off && {
          top: ((off.fromMinutes - GRID_START_HOUR * 60) / 60) * HOUR_PX,
          height: ((off.toMinutes - off.fromMinutes) / 60) * HOUR_PX,
        },
        events: this.appointments()
          .filter((item) => sameDay(new Date(item.startsAt), date))
          .map((item) => this.toEvent(item, selected)),
        busy: this.busy()
          .filter((item) => sameDay(new Date(item.startsAt), date))
          .map((block) => ({
            block,
            top: gridTop(block.startsAt),
            height: Math.max(
              (durationMin(block.startsAt, block.endsAt) / 60) * HOUR_PX - 2,
              CONTACT_HEIGHT_PX,
            ),
            title: this.busyTitle(block),
            time: formatSpacedTimeRange(block.startsAt, block.endsAt, this.locale),
            name: busyName(block.startsAt, block.endsAt, block.calendar, this.locale),
          })),
        now: isToday && inHours ? gridTop(now) : null,
      };
    });
  });

  private toEvent(appointment: Appointment, selected: string | null): GridEvent {
    const contact = appointment.kind === 'contact';
    const status = statusLabel(appointment.status);
    const modality =
      appointment.modality !== 'in_person' ? modalityLabel(appointment.modality) : null;
    const suffix = status ?? (contact ? null : modality);
    return {
      appointment,
      top: gridTop(appointment.startsAt),
      height: contact
        ? CONTACT_HEIGHT_PX
        : Math.max((durationMin(appointment.startsAt, appointment.endsAt) / 60) * HOUR_PX - 1, 20),
      name: contact
        ? $localize`:Contact téléphonique dans la grille@@agenda.grid.call:Appel · ${appointment.patient.displayName}:name:`
        : appointment.patient.displayName,
      time: contact
        ? formatTime(appointment.startsAt, this.locale)
        : formatTimeRange(appointment.startsAt, appointment.endsAt, this.locale),
      suffix,
      suffixKind: status ? 'status' : suffix ? 'modality' : null,
      modality: modalityLabel(appointment.modality),
      contact,
      selected: appointment.id === selected,
    };
  }

  protected onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest('a, .busy')) return;
    const host = target.closest<HTMLElement>('.column');
    const column = this.columns().find((item) => item.iso === host?.dataset['day']);
    if (!host || !column) return;
    const offset = event.clientY - host.getBoundingClientRect().top;
    const minutes =
      GRID_START_HOUR * 60 + Math.floor(offset / HOUR_PX / (SLOT_STEP_MIN / 60)) * SLOT_STEP_MIN;
    const bounded = Math.min(
      Math.max(minutes, GRID_START_HOUR * 60),
      GRID_END_HOUR * 60 - SLOT_STEP_MIN,
    );
    const slot = new Date(column.date);
    slot.setHours(Math.floor(bounded / 60), bounded % 60, 0, 0);
    this.slotPicked.emit(slot);
  }
}
