import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  LOCALE_ID,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { PreferencesStore } from '../../../core/preferences';
import { ACCOUNT_PATHS, SidePanelComponent } from '../../../shared/ui';
import { DateFieldComponent } from '../../../shared/ui/date-field';
import { initials, uniqueId } from '../../../shared/util';
import { DEMO_PLACE } from '../data/agenda.fixtures';
import {
  addDays,
  APPOINTMENT_MODALITIES,
  Appointment,
  AppointmentModality,
  AppointmentPatient,
  BusyBlock,
  DURATIONS_MIN,
  fromIsoDay,
  sameDay,
  toIsoDay,
} from '../data/agenda.model';
import {
  formatDayMonth,
  formatShortDate,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
  googleCalendarLabel,
  modalityLabel,
  modalityTitle,
} from '../ui/agenda-format';

/** Ce que la page donne au panneau : le créneau cliqué et le contexte du jour (fiche 15b). */
export interface NewAppointmentData {
  slot: Date;
  /** Patient prérempli (depuis la fiche patient ou le dernier rendez-vous ouvert), sinon null. */
  patient: AppointmentPatient | null;
  /** Dernière séance du patient prérempli, pour la ligne de rythme. */
  lastSessionAt: string | null;
  /** Rendez-vous déjà connus de la plage, pour le voisinage et les chevauchements. */
  appointments: readonly Appointment[];
  busy: readonly BusyBlock[];
}

/** Au plus 26 occurrences par série (fiche 15b : 422 au-delà). */
export const MAX_OCCURRENCES = 26;

/** Rythme habituel accepté sans avertissement : de 7 à 14 jours après la dernière séance. */
const RHYTHM_MIN_DAYS = 7;
const RHYTHM_MAX_DAYS = 14;

type RepeatEvery = 0 | 1 | 2 | 4;
type RepeatCount = '4' | '8' | 'until';

/**
 * Panneau « Nouveau rendez-vous » (fiche 15b, maquette) : patient (carte + recherche + ligne de
 * rythme), créneau (date, début, durée ; fin et voisinage recalculés), modalité (segments
 * `aria-pressed`), répéter (deux listes natives), note jamais envoyée à Google, aperçu de ce qui
 * sera copié dans Google (`aria-live`), avertissement de conflit (ambre), pied « Planifier n
 * rendez-vous » + « À confirmer » + Annuler. Tout est recalculé localement ; sans module
 * `scheduling`, « Planifier » ferme le panneau sans rien créer (`POST /api/appointments` viendra
 * dans agenda.api.ts, le formulaire est déjà celui du contrat prévu).
 */
@Component({
  selector: 'pm-new-appointment-panel',
  imports: [ReactiveFormsModule, RouterLink, SidePanelComponent, DateFieldComponent],
  templateUrl: './new-appointment.panel.html',
  styleUrl: './new-appointment.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAppointmentPanel {
  protected readonly data = inject<NewAppointmentData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly preferences = inject(PreferencesStore);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly ids = {
    patient: uniqueId('rdv-patient'),
    date: uniqueId('rdv-date'),
    start: uniqueId('rdv-start'),
    duration: uniqueId('rdv-duration'),
    repeat: uniqueId('rdv-repeat'),
    count: uniqueId('rdv-count'),
    until: uniqueId('rdv-until'),
    note: uniqueId('rdv-note'),
  };

  protected readonly title = $localize`:Titre du panneau Nouveau rendez-vous@@agenda.new.title:Nouveau rendez-vous`;
  protected readonly subtitle = $localize`:Sous-titre du panneau, créneau cliqué@@agenda.new.subtitle:Créneau cliqué : ${formatWeekdayDate(this.data.slot, this.locale, false)}:date:, ${formatTime(this.data.slot, this.locale)}:time:`;
  protected readonly modalities = APPOINTMENT_MODALITIES;
  protected readonly durations = DURATIONS_MIN;
  protected readonly place = DEMO_PLACE;
  protected readonly preferencesPath = ACCOUNT_PATHS.preferences;
  protected readonly modalityTitle = modalityTitle;
  protected readonly patientInitials = computed(() =>
    this.data.patient ? initials(this.data.patient.displayName) : '',
  );
  protected readonly searchPlaceholder = $localize`:Champ de recherche d'un autre patient@@agenda.new.searchPlaceholder:Ou rechercher un autre patient…`;
  protected readonly countAriaLabel = $localize`:Liste du nombre de répétitions@@agenda.new.countLabel:Nombre de répétitions`;
  protected readonly notePlaceholder = $localize`:Exemple de note de planification@@agenda.new.notePlaceholder:ex. apporter le carnet du soir`;
  protected readonly googleLabel = $localize`:Nom du bloc Synchronisation Google@@agenda.new.google.label:Synchronisation Google`;
  protected readonly confirmLabel = $localize`:Case À confirmer du panneau@@agenda.new.toConfirm:À confirmer avec la patiente`;

  /** « 34 ans · dernière séance le 31 oct. · rythme toutes les 1 à 2 semaines ». */
  protected readonly patientMeta = computed(() => {
    const patient = this.data.patient;
    if (!patient) return '';
    const parts: string[] = [];
    if (patient.age !== null) {
      parts.push($localize`:Âge du patient dans la carte@@agenda.new.age:${patient.age}:age: ans`);
    }
    if (this.data.lastSessionAt) {
      const date = formatDayMonth(new Date(this.data.lastSessionAt), this.locale);
      parts.push(
        $localize`:Dernière séance dans la carte patient@@agenda.new.lastSession:dernière séance le ${date}:date:`,
      );
    }
    parts.push(
      $localize`:Rythme dans la carte patient@@agenda.new.rhythm:rythme ${patient.rhythm}:rhythm:`,
    );
    return parts.join(' · ');
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    date: [toIsoDay(this.data.slot), Validators.required],
    start: [
      formatTime(this.data.slot, this.locale),
      [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)],
    ],
    duration: [this.data.patient ? 50 : this.preferences.defaultDurationMin()],
    modality: ['in_person' as AppointmentModality],
    repeat: [0 as RepeatEvery],
    count: ['4' as RepeatCount],
    until: [null as string | null],
    note: [''],
    toConfirm: [false],
  });

  private readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  /** Début du premier rendez-vous, ou null tant que date ou heure ne se lisent pas. */
  protected readonly start = computed<Date | null>(() => {
    const value = this.values();
    const day = fromIsoDay(value.date ?? null);
    const match = /^(\d{2}):(\d{2})$/.exec(value.start ?? '');
    if (!day || !match) return null;
    const date = new Date(day);
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  });

  protected readonly end = computed<Date | null>(() => {
    const start = this.start();
    const duration = Number(this.values().duration ?? 0);
    return start ? new Date(start.getTime() + duration * 60_000) : null;
  });

  /** Les occurrences de la série (une seule sans répétition), bornées à 26. */
  protected readonly occurrences = computed<Date[]>(() => {
    const start = this.start();
    if (!start) return [];
    const every = Number(this.values().repeat ?? 0) as RepeatEvery;
    if (every === 0) return [start];
    const count = this.values().count;
    const until = count === 'until' ? fromIsoDay(this.values().until ?? null) : null;
    const limit = count === 'until' ? MAX_OCCURRENCES : Number(count);
    const list: Date[] = [];
    for (let index = 0; index < limit; index++) {
      const date = addDays(start, 7 * every * index);
      if (until && date > addDays(until, 1)) break;
      list.push(date);
    }
    return list;
  });

  protected readonly endLabel = computed(() => {
    const end = this.end();
    return end ? formatTime(end, this.locale) : '—';
  });

  /** « suivi de Théo B. à 11:30, pas de chevauchement » ou le chevauchement constaté. */
  protected readonly neighborLabel = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return '';
    const sameDayItems = this.data.appointments.filter((item) =>
      sameDay(new Date(item.startsAt), start),
    );
    const overlap = sameDayItems.find(
      (item) => new Date(item.startsAt) < end && new Date(item.endsAt) > start,
    );
    if (overlap) {
      const range = formatTimeRange(overlap.startsAt, overlap.endsAt, this.locale);
      return $localize`:Créneau en conflit avec un autre rendez-vous@@agenda.new.overlap:chevauche ${overlap.patient.displayName}:name: (${range}:range:)`;
    }
    const next = sameDayItems.find((item) => new Date(item.startsAt) >= end);
    if (!next) {
      return $localize`:Aucun rendez-vous après le créneau@@agenda.new.noNext:aucun rendez-vous ensuite ce jour-là`;
    }
    const at = formatTime(next.startsAt, this.locale);
    return $localize`:Rendez-vous suivant du créneau@@agenda.new.next:suivi de ${next.patient.displayName}:name: à ${at}:time:, pas de chevauchement`;
  });

  /** Ligne sous le patient : le créneau respecte-t-il le rythme habituel ? */
  protected readonly rhythm = computed<{ ok: boolean; text: string } | null>(() => {
    const start = this.start();
    const last = this.data.lastSessionAt;
    if (!start || !last) return null;
    const lastDate = new Date(last);
    const days = Math.round((start.getTime() - lastDate.getTime()) / 86_400_000);
    const since = formatDayMonth(lastDate, this.locale);
    if (days >= RHYTHM_MIN_DAYS && days <= RHYTHM_MAX_DAYS) {
      return {
        ok: true,
        text: $localize`:Le créneau respecte le rythme@@agenda.new.rhythm.ok:Le créneau respecte le rythme habituel (${days}:days: jours après le ${since}:date:).`,
      };
    }
    return {
      ok: false,
      text:
        days < RHYTHM_MIN_DAYS
          ? $localize`:Le créneau est trop tôt@@agenda.new.rhythm.early:Le créneau est plus tôt que le rythme habituel (${days}:days: jours après le ${since}:date:).`
          : $localize`:Le créneau est trop tard@@agenda.new.rhythm.late:Le créneau est plus tard que le rythme habituel (${days}:days: jours après le ${since}:date:).`,
    };
  });

  /** « 4 fois (jusqu'au 19 déc.) », « 8 fois » (maquette) : la date de la dernière occurrence pour 4. */
  protected countLabel(count: 4 | 8): string {
    const start = this.start();
    const every = Number(this.values().repeat ?? 0) || 1;
    if (!start || count !== 4) {
      return $localize`:Nombre de répétitions@@agenda.new.count:${count}:count: fois`;
    }
    const last = formatDayMonth(addDays(start, 7 * every * (count - 1)), this.locale);
    return $localize`:Nombre de répétitions avec la date de la dernière@@agenda.new.countUntil:${count}:count: fois (jusqu'au ${last}:date:)`;
  }

  /** Aperçu de l'événement Google : « Séance · M. D. », puis date, heures, modalité, occurrences. */
  protected readonly googleSummary = computed(() => {
    const patient = this.data.patient;
    if (!patient) return $localize`:Titre Google sans patient@@agenda.new.google.noPatient:Séance`;
    const letters = patient.displayName
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .join('. ');
    return $localize`:Titre de l'événement Google (initiales)@@agenda.new.google.summary:Séance · ${letters}:initials:.`;
  });

  protected readonly googleLine = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return '';
    const parts = [
      formatShortDate(start, this.locale).replace(/ \d{4}$/, ''),
      `${formatTime(start, this.locale)}–${formatTime(end, this.locale)}`,
      modalityTitle(this.values().modality ?? 'in_person'),
    ];
    const count = this.occurrences().length;
    if (count > 1) {
      parts.push(
        $localize`:Nombre d'occurrences dans l'aperçu Google@@agenda.new.google.occurrences:${count}:count: occurrences`,
      );
    }
    return parts.join(' · ');
  });

  /** Première occurrence qui chevauche un bloc « Occupé · Google », ou null. */
  protected readonly conflict = computed(() => {
    const duration = Number(this.values().duration ?? 0) * 60_000;
    for (const occurrence of this.occurrences()) {
      const end = new Date(occurrence.getTime() + duration);
      const block = this.data.busy.find(
        (item) => new Date(item.startsAt) < end && new Date(item.endsAt) > occurrence,
      );
      if (block) {
        const day = formatDayMonth(occurrence, this.locale);
        const calendar = googleCalendarLabel(block.calendar);
        const range = formatTimeRange(block.startsAt, block.endsAt, this.locale);
        return $localize`:Avertissement de conflit avec un bloc Google@@agenda.new.conflict:L'occurrence du ${day}:date: chevauche un bloc « Occupé · ${calendar}:calendar: » (${range}:range:). Elle sera créée quand même ; vous pourrez la déplacer depuis l'agenda.`;
      }
    }
    return null;
  });

  protected readonly submitLabel = computed(() => {
    const count = this.occurrences().length;
    return count > 1
      ? $localize`:Bouton principal, plusieurs rendez-vous@@agenda.new.submitMany:Planifier ${count}:count: rendez-vous`
      : $localize`:Bouton principal, un rendez-vous@@agenda.new.submitOne:Planifier le rendez-vous`;
  });

  protected readonly modalityHint = computed(() => {
    const place = this.place;
    return $localize`:Aide sous les segments de modalité@@agenda.new.modalityHint:${place}:place:. En visio, le lien de réunion est ajouté à l'événement Google si vous l'y collez.`;
  });

  protected modalityLabel(modality: AppointmentModality): string {
    return modalityLabel(modality);
  }

  protected setModality(modality: AppointmentModality): void {
    this.form.controls.modality.setValue(modality);
  }

  protected isModality(modality: AppointmentModality): boolean {
    return this.values().modality === modality;
  }

  protected repeating(): boolean {
    return Number(this.values().repeat ?? 0) > 0;
  }

  protected untilChosen(): boolean {
    return this.repeating() && this.values().count === 'until';
  }

  /** « Changer » : le focus va à la recherche (la liste des patients actifs arrivera avec l'API). */
  protected changePatient(): void {
    this.search()?.nativeElement.focus();
  }

  /** Sans module scheduling : le panneau se ferme, rien n'est créé (le store l'enverra plus tard). */
  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close();
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
