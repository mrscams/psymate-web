import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  LOCALE_ID,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, startWith } from 'rxjs';

import { FieldProblem } from '../../../core/http';
import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { applyProblem, FieldErrorsComponent, fieldId } from '../../../shared/forms';
import { FormErrorsComponent, SidePanelComponent } from '../../../shared/ui';
import { DateFieldComponent } from '../../../shared/ui/date-field';
import { initials } from '../../../shared/util';
import {
  addDays,
  APPOINTMENT_MODALITIES,
  AppointmentModality,
  AppointmentRecurrence,
  atLocal,
  browserTimeZone,
  CreatedAppointments,
  DURATIONS_MIN,
  MAX_OCCURRENCES,
  NewAppointment,
  occurrencesOf,
  PatientOption,
  PLANNING_NOTE_MAX,
  RepeatWeeks,
  toIsoDay,
} from '../data/agenda.model';
import { NewAppointmentStore } from '../data/new-appointment.store';
import {
  appointmentName,
  formatDayMonth,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
  modalityTitle,
} from '../ui/agenda-format';

/** Ce que la page donne au panneau (fiche 15b) : le créneau, et de quoi préremplir. */
export interface NewAppointmentData {
  slot: Date;
  /** Patient prérempli (Dupliquer, rendez-vous ouvert), sinon null : la recherche a le focus. */
  patient: PatientOption | null;
  /** Dupliquer : modalité, durée et note du rendez-vous d'origine (gardées face aux défauts). */
  prefill?: {
    modality: AppointmentModality;
    durationMin: number;
    planningNote: string | null;
  } | null;
  /**
   * Appelé dès que la création réussit, même si le panneau a été fermé pendant l'envoi (croix) :
   * la page relit la plage et propose « Annuler » quoi qu'il arrive au panneau.
   */
  onCreated?: (created: CreatedAppointments) => void;
}

/** Ce que le panneau rend à la page après une création réussie. */
export interface NewAppointmentResult {
  created: CreatedAppointments;
}

/** Nombres de répétitions proposés : de 2 à 26 fois. */
const COUNTS: readonly number[] = Array.from({ length: MAX_OCCURRENCES - 1 }, (_, i) => i + 2);

/** Délai des lectures déclenchées par la saisie (recherche, conflits), fiche 15b. */
export const INPUT_DEBOUNCE_MS = 300;

/** Champ du contrat (errors[].field d'un 422) → contrôle du formulaire. */
const FIELD_CONTROLS: Record<string, string> = {
  patientId: 'patientId',
  startsAt: 'start',
  durationMin: 'duration',
  modality: 'modality',
  planningNote: 'note',
  tentative: 'toConfirm',
  tz: 'date',
  recurrence: 'count',
  'recurrence.count': 'count',
  'recurrence.until': 'until',
  'recurrence.everyWeeks': 'repeat',
};

type RepeatEvery = 0 | RepeatWeeks;

/**
 * Panneau « Nouveau rendez-vous » (fiche 15b, maquette) : patient (carte, recherche parmi les
 * patients actifs en liste `listbox` au clavier), créneau (date, début, durée ; fin et voisinage),
 * modalité (segments `aria-pressed`), répéter (listes natives : toutes les 1 / 2 / 4 semaines, de 2
 * à 26 fois ou jusqu'à une date), note, avertissement de chevauchement (ambre, `aria-live`), pied
 * « Planifier n rendez-vous » + « À confirmer » + Annuler. Le patient choisi donne durée, modalité
 * et rythme (`GET /api/patients/{id}/appointments`) ; le créneau est vérifié par
 * `GET /api/agenda/freebusy` (300 ms après la dernière saisie). La création
 * (`POST /api/appointments`) ferme le panneau avec son résultat ; un 422 se lie aux champs.
 */
@Component({
  selector: 'pm-new-appointment-panel',
  imports: [
    ReactiveFormsModule,
    SidePanelComponent,
    DateFieldComponent,
    FormErrorsComponent,
    FieldErrorsComponent,
  ],
  providers: [NewAppointmentStore],
  templateUrl: './new-appointment.panel.html',
  styleUrl: './new-appointment.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'holdEscape($event)' },
})
export class NewAppointmentPanel {
  protected readonly data = inject<NewAppointmentData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<NewAppointmentResult>>(DialogRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly preferences = inject(PreferencesStore);
  private readonly vocabulary = inject(SubjectVocabulary);
  protected readonly store = inject(NewAppointmentStore);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly timeZone = browserTimeZone();

  protected readonly fieldId = fieldId;
  protected readonly formId = 'agenda-new-form';
  protected readonly listboxId = 'agenda-new-patients';
  protected readonly title = $localize`:Titre du panneau Nouveau rendez-vous@@agenda.new.title:Nouveau rendez-vous`;
  protected readonly subtitle = $localize`:Sous-titre du panneau, créneau cliqué@@agenda.new.subtitle:Créneau cliqué : ${formatWeekdayDate(this.data.slot, this.locale, false)}:date:, ${formatTime(this.data.slot, this.locale)}:time:`;
  protected readonly modalities = APPOINTMENT_MODALITIES;
  protected readonly counts = COUNTS;
  protected readonly noteMax = PLANNING_NOTE_MAX;
  protected readonly modalityTitle = modalityTitle;
  protected readonly searchPlaceholder = $localize`:Champ de recherche d'un patient@@agenda.new.searchPlaceholder:Rechercher un patient…`;
  protected readonly otherPlaceholder = $localize`:Champ de recherche d'un autre patient@@agenda.new.searchOther:Ou rechercher un autre patient…`;
  protected readonly countAriaLabel = $localize`:Liste du nombre de répétitions@@agenda.new.countLabel:Nombre de répétitions`;
  protected readonly notePlaceholder = $localize`:Exemple de note de planification@@agenda.new.notePlaceholder:ex. apporter le carnet du soir`;
  protected readonly startPlaceholder = $localize`:Exemple d'heure de début du rendez-vous@@agenda.new.startPlaceholder:10:00`;
  /** « À confirmer avec le patient » / « … le client » (préférence `vocabulary.subjectLabel`). */
  protected readonly confirmLabel = computed(() => {
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return $localize`:Case À confirmer du panneau@@agenda.new.toConfirm:À confirmer avec le ${subject}:subject:`;
  });
  protected readonly noResults = $localize`:Recherche de patient sans résultat@@agenda.new.noResults:Aucun patient actif ne correspond.`;
  protected readonly searching = $localize`:Recherche de patient en cours@@agenda.new.searching:Recherche…`;
  protected readonly searchFailed = $localize`:Recherche de patient en erreur@@agenda.new.searchFailed:La recherche n'a pas abouti. Réessayez.`;
  protected readonly fieldLabels: Record<string, string> = {
    patientId: $localize`:Champ patient, résumé des erreurs@@agenda.new.field.patient:Patient`,
    date: $localize`:Champ date, résumé des erreurs@@agenda.new.field.date:Date`,
    start: $localize`:Champ début, résumé des erreurs@@agenda.new.field.start:Début`,
    duration: $localize`:Champ durée, résumé des erreurs@@agenda.new.field.duration:Durée`,
    modality: $localize`:Champ modalité, résumé des erreurs@@agenda.new.field.modality:Modalité`,
    repeat: $localize`:Champ répéter, résumé des erreurs@@agenda.new.field.repeat:Répéter`,
    count: $localize`:Champ répétitions, résumé des erreurs@@agenda.new.field.count:Répétitions`,
    until: $localize`:Champ fin de série, résumé des erreurs@@agenda.new.field.until:Jusqu'au`,
    note: $localize`:Champ note, résumé des erreurs@@agenda.new.field.note:Note de planification`,
    toConfirm: $localize`:Champ à confirmer, résumé des erreurs@@agenda.new.field.toConfirm:À confirmer`,
  };

  /** Patient choisi (carte), null tant qu'aucun ne l'est. */
  protected readonly chosen = signal<PatientOption | null>(this.data.patient);
  protected readonly patientInitials = computed(() => initials(this.chosen()?.displayName ?? ''));

  protected readonly form = inject(NonNullableFormBuilder).group({
    patientId: [this.data.patient?.id ?? '', Validators.required],
    date: [toIsoDay(this.data.slot), Validators.required],
    start: [
      formatTime(this.data.slot, this.locale),
      [Validators.required, Validators.pattern(/^\d{1,2}:\d{2}$/)],
    ],
    duration: [this.data.prefill?.durationMin ?? this.preferences.defaultDurationMin()],
    modality: [this.data.prefill?.modality ?? ('in_person' as AppointmentModality)],
    repeat: [0 as RepeatEvery],
    count: ['4'],
    until: [null as string | null],
    note: [this.data.prefill?.planningNote ?? '', Validators.maxLength(PLANNING_NOTE_MAX)],
    toConfirm: [false],
  });

  /** Recherche de patient : hors du formulaire (seul l'identifiant choisi part au serveur). */
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly listOpen = signal(false);
  protected readonly activeIndex = signal(-1);

  /** Erreurs d'un 422 pour le résumé ; message général pour 403, 404 et le reste. */
  protected readonly errors = signal<FieldProblem[]>([]);
  protected readonly unmatched = signal<string[]>([]);
  protected readonly message = signal<string | null>(null);

  private readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  constructor() {
    // Dupliquer : la modalité et la durée d'origine priment sur les défauts du patient.
    if (this.data.prefill) {
      this.form.controls.duration.markAsDirty();
      this.form.controls.modality.markAsDirty();
    }
    if (this.data.patient) void this.choose(this.data.patient);

    // « Jusqu'à une date… » : la date de fin devient obligatoire (sinon une seule occurrence partirait).
    const { repeat, count, until } = this.form.controls;
    const syncUntil = () => {
      const required = Number(repeat.value) > 0 && count.value === 'until';
      until.setValidators(required ? Validators.required : null);
      until.updateValueAndValidity({ emitEvent: false });
    };
    repeat.valueChanges.pipe(takeUntilDestroyed()).subscribe(syncUntil);
    count.valueChanges.pipe(takeUntilDestroyed()).subscribe(syncUntil);

    this.searchControl.valueChanges
      .pipe(debounceTime(INPUT_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((query) => {
        this.activeIndex.set(-1);
        void this.store.search(query);
      });
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((query) => {
      this.listOpen.set(query.trim().length > 0);
    });

    // Conflits et voisinage du premier créneau, 300 ms après la dernière modification.
    this.form.valueChanges
      .pipe(
        startWith(null),
        map(() => {
          const start = this.slotStart();
          const duration = Number(this.form.controls.duration.value);
          return start ? `${start.toISOString()}|${duration}` : '';
        }),
        distinctUntilChanged(),
        debounceTime(INPUT_DEBOUNCE_MS),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const start = this.slotStart();
        const end = start
          ? new Date(start.getTime() + Number(this.form.controls.duration.value) * 60_000)
          : null;
        void this.store.checkSlot(start, end, this.timeZone);
      });
  }

  private slotStart(): Date | null {
    const { date, start } = this.form.getRawValue();
    return atLocal(date, start);
  }

  // --- Patient --------------------------------------------------------------------------------

  protected readonly results = computed(() => this.store.results().data ?? []);
  protected readonly activeId = computed(() => {
    const index = this.activeIndex();
    return index >= 0 && this.listOpen() ? `${this.listboxId}-${index}` : null;
  });

  /** « 34 ans · rythme toutes les 2 semaines · prochain rendez-vous le 12 nov. à 10:00 ». */
  protected readonly patientMeta = computed(() => {
    const patient = this.chosen();
    if (!patient) return '';
    const parts: string[] = [];
    if (patient.age !== null) {
      parts.push($localize`:Âge du patient dans la carte@@agenda.new.age:${patient.age}:age: ans`);
    }
    const details = this.store.patient().data;
    const rhythm = details?.defaults.rhythm;
    if (rhythm) {
      parts.push(
        $localize`:Rythme dans la carte patient@@agenda.new.rhythm:rythme ${rhythm}:rhythm:`,
      );
    }
    const next = details?.appointments[0];
    if (next) {
      const date = formatDayMonth(new Date(next.startsAt), this.locale);
      const time = formatTime(next.startsAt, this.locale);
      parts.push(
        $localize`:Prochain rendez-vous du patient dans la carte@@agenda.new.nextAppointment:prochain rendez-vous le ${date}:date: à ${time}:time:`,
      );
    }
    return parts.join(' · ');
  });

  /**
   * Choisit un patient : carte, identifiant au formulaire, défauts lus. Durée et modalité prennent
   * ceux du patient sauf si elles ont déjà été modifiées dans ce panneau (fiche 15b).
   */
  protected async choose(patient: PatientOption): Promise<void> {
    this.chosen.set(patient);
    this.form.controls.patientId.setValue(patient.id);
    this.searchControl.setValue('', { emitEvent: false });
    this.listOpen.set(false);
    this.activeIndex.set(-1);
    this.store.clearResults();
    const details = await this.store.loadPatient(patient.id);
    if (!details || this.chosen()?.id !== patient.id) return;
    const { duration, modality } = this.form.controls;
    if (!duration.dirty) duration.setValue(details.defaults.durationMin);
    if (!modality.dirty) modality.setValue(details.defaults.modality);
  }

  /** « Changer » : la recherche reprend le focus. */
  protected changePatient(): void {
    this.searchInput()?.nativeElement.focus();
  }

  /** Clavier de la recherche : ↓ ↑ parcourent la liste, Entrée choisit, Échap la ferme. */
  protected onSearchKey(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) return;
        event.preventDefault();
        this.listOpen.set(true);
        this.activeIndex.update((index) => (index + 1) % count);
        return;
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault();
        this.activeIndex.update((index) => (index <= 0 ? count - 1 : index - 1));
        return;
      case 'Enter': {
        const option = this.results()[this.activeIndex()];
        if (!this.listOpen() || !option) return;
        event.preventDefault();
        void this.choose(option);
        return;
      }
      case 'Escape':
        if (!this.listOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        this.listOpen.set(false);
        return;
    }
  }

  // --- Créneau, répétition, chevauchements ----------------------------------------------------

  protected readonly start = computed(() => {
    const value = this.values();
    return atLocal(value.date, value.start);
  });

  protected readonly end = computed<Date | null>(() => {
    const start = this.start();
    const duration = Number(this.values().duration ?? 0);
    return start ? new Date(start.getTime() + duration * 60_000) : null;
  });

  /** Durées proposées : celles du panneau, plus la durée courante (défaut du patient). */
  protected readonly durations = computed(() => {
    const list = new Set(DURATIONS_MIN);
    list.add(Number(this.values().duration));
    return [...list].filter((value) => value > 0).sort((a, b) => a - b);
  });

  private readonly recurrence = computed<AppointmentRecurrence | null>(() => {
    const value = this.values();
    const every = Number(value.repeat ?? 0) as RepeatEvery;
    if (every === 0) return null;
    if (value.count === 'until') {
      return value.until ? { everyWeeks: every, until: value.until } : null;
    }
    return { everyWeeks: every, count: Number(value.count) };
  });

  /** Les occurrences de la série (une seule sans répétition) ; 27 au plus pour dire « au-delà ». */
  protected readonly occurrences = computed<Date[]>(() => {
    const start = this.start();
    return start ? occurrencesOf(start, this.recurrence()) : [];
  });

  protected readonly tooMany = computed(() => this.occurrences().length > MAX_OCCURRENCES);
  protected readonly tooManyText = $localize`:Série trop longue@@agenda.new.tooMany:Au-delà de ${MAX_OCCURRENCES}:max: rendez-vous, la série sera refusée : choisissez une date de fin plus proche.`;

  protected readonly endLabel = computed(() => {
    const end = this.end();
    return end ? formatTime(end, this.locale) : '—';
  });

  /** « précédent : Omar B. à 09:00 · suivant : Théo B. à 11:30 · pas de chevauchement ». */
  protected readonly neighborLabel = computed(() => {
    const freeBusy = this.store.freeBusy();
    if (!freeBusy || freeBusy.conflicts.length > 0) return null;
    const parts: string[] = [];
    if (freeBusy.previous) {
      const name = appointmentName(freeBusy.previous);
      const at = formatTime(freeBusy.previous.startsAt, this.locale);
      parts.push(
        $localize`:Rendez-vous précédent du créneau@@agenda.new.previous:précédent : ${name}:name: à ${at}:time:`,
      );
    }
    if (freeBusy.next) {
      const name = appointmentName(freeBusy.next);
      const at = formatTime(freeBusy.next.startsAt, this.locale);
      parts.push(
        $localize`:Rendez-vous suivant du créneau@@agenda.new.next:suivant : ${name}:name: à ${at}:time:`,
      );
    }
    parts.push(
      $localize`:Aucun chevauchement sur le créneau@@agenda.new.noOverlap:pas de chevauchement`,
    );
    return parts.join(' · ');
  });

  /** Bandeau ambre : le créneau chevauche un rendez-vous existant (jamais bloquant). */
  protected readonly conflict = computed(() => {
    const first = this.store.freeBusy()?.conflicts[0];
    if (!first) return null;
    const name = first.patientDisplayName;
    const range = formatTimeRange(first.startsAt, first.endsAt, this.locale);
    return $localize`:Avertissement de chevauchement@@agenda.new.conflict:Chevauche le rendez-vous de ${name}:name: (${range}:range:). Il sera créé quand même ; vous pourrez le déplacer depuis l'agenda.`;
  });

  /** « 4 fois (jusqu'au 19 déc.) » : la date de la dernière occurrence. */
  protected countLabel(count: number): string {
    const start = this.start();
    const every = Number(this.values().repeat ?? 0) || 1;
    if (!start) return $localize`:Nombre de répétitions@@agenda.new.count:${count}:count: fois`;
    const last = formatDayMonth(addDays(start, 7 * every * (count - 1)), this.locale);
    return $localize`:Nombre de répétitions avec la date de la dernière@@agenda.new.countUntil:${count}:count: fois (jusqu'au ${last}:date:)`;
  }

  protected readonly submitLabel = computed(() => {
    const count = Math.min(this.occurrences().length, MAX_OCCURRENCES);
    return count > 1
      ? $localize`:Bouton principal, plusieurs rendez-vous@@agenda.new.submitMany:Planifier ${count}:count: rendez-vous`
      : $localize`:Bouton principal, un rendez-vous@@agenda.new.submitOne:Planifier le rendez-vous`;
  });

  protected setModality(modality: AppointmentModality): void {
    this.form.controls.modality.setValue(modality);
    this.form.controls.modality.markAsDirty();
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

  protected invalid(name: string): boolean {
    const control = this.form.get(name);
    if (!control) return false;
    return control.invalid && (control.touched || control.dirty);
  }

  // --- Soumission -----------------------------------------------------------------------------

  protected async submit(): Promise<void> {
    if (this.store.submitting()) return;
    this.message.set(null);
    const start = this.start();
    if (this.form.invalid || !start) {
      this.form.markAllAsTouched();
      this.errors.set([]);
      return;
    }
    const value = this.form.getRawValue();
    const repeat = Number(value.repeat) as RepeatEvery;
    const every = repeat as RepeatWeeks;
    const request: NewAppointment = {
      patientId: value.patientId,
      startsAt: start.toISOString(),
      durationMin: Number(value.duration),
      modality: value.modality,
      planningNote: value.note,
      tentative: value.toConfirm,
      tz: this.timeZone,
    };
    if (repeat > 0) {
      request.recurrence =
        value.count === 'until'
          ? { everyWeeks: every, until: value.until ?? '' }
          : { everyWeeks: every, count: Number(value.count) };
    }
    this.dialogRef.disableClose = true;
    const created = await this.store.create(request);
    this.dialogRef.disableClose = false;
    if (created) {
      this.data.onCreated?.(created);
      this.dialogRef.close({ created });
      return;
    }
    this.showProblem();
  }

  /** Pendant l'envoi, Échap ne ferme pas le panneau (la création ne doit pas se perdre). */
  protected holdEscape(event: Event): void {
    if (!this.store.submitting()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** 422 → résumé et champs ; 403 / 404 patient → message général ; autre → réessayer. */
  private showProblem(): void {
    const problem = this.store.problem();
    if (!problem) return;
    if (problem.status === 422) {
      const mapped = (problem.errors ?? []).map((error) => ({
        ...error,
        field: FIELD_CONTROLS[error.field] ?? error.field,
      }));
      const { unmatched } = applyProblem(this.form, { ...problem, errors: mapped });
      this.unmatched.set(unmatched.map((error) => error.field));
      this.errors.set(mapped);
      return;
    }
    this.errors.set([]);
    this.message.set(
      problem.status === 403 || problem.status === 404
        ? $localize`:Création refusée, patient inaccessible@@agenda.new.patientUnavailable:Ce patient n'est plus accessible : choisissez-en un autre.`
        : $localize`:Création en échec@@agenda.new.failed:Les rendez-vous n'ont pas pu être planifiés. Réessayez dans un instant.`,
    );
  }

  protected cancel(): void {
    if (this.store.submitting()) return;
    this.dialogRef.close();
  }
}
