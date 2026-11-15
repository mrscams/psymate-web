import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  LOCALE_ID,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { formatMonthYear } from '../../../core/i18n';
import { applyProblem, FieldErrorsComponent } from '../../../shared/forms';
import { StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { DateFieldComponent } from '../../../shared/ui/date-field';
import { initials, uniqueId } from '../../../shared/util';
import {
  Appointment,
  atLocal,
  CANCEL_REASON_MAX,
  DURATIONS_MIN,
  isActive,
  PLANNING_NOTE_MAX,
  toIsoDay,
} from '../data/agenda.model';
import { AgendaStore, DetailState } from '../data/agenda.store';
import {
  conflictMessage,
  formatDayMonth,
  formatSpacedTimeRange,
  formatTime,
  formatWeekdayDate,
  modalityLabel,
  modalityTitle,
} from './agenda-format';

/** Champ du contrat (errors[].field d'un 422 du PATCH) → contrôle du formulaire Déplacer. */
const MOVE_FIELDS: Record<string, string> = { startsAt: 'start', durationMin: 'duration' };

/** Ce que le détail a ouvert sous l'en-tête : rien, le formulaire Déplacer, ou l'annulation. */
type Mode = 'idle' | 'move' | 'cancel';

type NoteStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Message d'un problème d'écriture : le `detail` du serveur, sinon une phrase générique. */
export function problemText(problem: ApiProblem): string {
  return (
    problem.detail ??
    $localize`:Échec d'une action de l'agenda, sans détail@@agenda.detail.failed:L'action n'a pas abouti. Réessayez dans un instant.`
  );
}

/**
 * Détail du rendez-vous ouvert (fiche 15 §5, maquette) : carte de 320 à 360 px à droite de la
 * grille, bande supérieure de la couleur de la modalité, étiquette « Séance planifiée · cabinet » et
 * croix ; patient (initiales, nom lié au dossier, âge, suivi depuis) ; date et heures mono ;
 * modalité, durée, rythme ; « Préparer » (vue d'ensemble du patient : dernière séance, ce qui s'est
 * passé depuis ; liens Vue d'ensemble et Timeline) ; note de planification, enregistrée au blur ;
 * pied : « Démarrer la séance » (à venir, M11-08), Confirmer (à confirmer seulement), Déplacer
 * (formulaire inline, équivalent clavier du glisser-déposer), Dupliquer (panneau 15b prérempli),
 * Annuler (motif facultatif). Un rendez-vous annulé ou fait ne se déplace ni ne s'annule plus. Sans
 * rendez-vous (lecture à part, 404, erreur), l'état est montré dans la carte.
 */
@Component({
  selector: 'pm-appointment-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    StateComponent,
    DateFieldComponent,
    FieldErrorsComponent,
  ],
  templateUrl: './appointment-detail.component.html',
  styleUrl: './appointment-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    '[attr.aria-label]': 'panelLabel',
    '[class]': 'appointment()?.modality ?? ""',
  },
})
export class AppointmentDetailComponent {
  readonly appointment = input<Appointment | null>(null);
  readonly state = input<DetailState>('ready');
  /** Fermeture (croix, annulation réussie) : le rendez-vous, pour rendre le focus à son jour. */
  readonly closed = output<Appointment | null>();
  /** « Dupliquer » : la page ouvre le panneau 15b prérempli. */
  readonly duplicated = output<Appointment>();

  protected readonly store = inject(AgendaStore);
  private readonly toasts = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly ids = {
    note: uniqueId('agenda-note'),
    noteStatus: uniqueId('agenda-note-status'),
    date: uniqueId('agenda-move-date'),
    start: uniqueId('agenda-move-start'),
    duration: uniqueId('agenda-move-duration'),
    reason: uniqueId('agenda-cancel-reason'),
    moveForm: uniqueId('agenda-move-form'),
    cancelForm: uniqueId('agenda-cancel-form'),
    moveButton: uniqueId('agenda-move-button'),
    cancelButton: uniqueId('agenda-cancel-button'),
  };
  protected readonly reasonMax = CANCEL_REASON_MAX;
  protected readonly noteMax = PLANNING_NOTE_MAX;
  protected readonly panelLabel = $localize`:Nom de la zone de détail du rendez-vous@@agenda.detail.label:Détail du rendez-vous`;
  protected readonly closeLabel = $localize`:Croix du détail du rendez-vous@@agenda.detail.close:Fermer le détail`;
  protected readonly startLabel = $localize`:Bouton principal du détail@@agenda.detail.start:Démarrer la séance`;
  protected readonly missingTitle = $localize`:Détail, rendez-vous introuvable@@agenda.detail.missing:Rendez-vous introuvable`;
  /** Détail en erreur (lecture à part) : « Réessayer » relit le rendez-vous. */
  protected readonly retry: StateAction = {
    label: $localize`:Bouton Réessayer du détail en erreur@@agenda.detail.retry:Réessayer`,
    handler: () => void this.store.retrySelected(),
  };
  protected readonly missingMessage = $localize`:Détail, rendez-vous introuvable, explication@@agenda.detail.missingMessage:Il a peut-être été supprimé, ou il appartient à un autre compte.`;

  /** « Démarrer la séance · à venir » : M11-08 n'est pas livrée, l'action reste inerte. */
  protected readonly startLater = $localize`:Action du détail non encore disponible@@agenda.detail.later:${this.startLabel}:action: · à venir`;

  protected readonly mode = signal<Mode>('idle');
  protected readonly busy = signal(false);
  /** Erreur de l'action en cours (formulaire Déplacer ou annulation), affichée sur place. */
  protected readonly actionError = signal<string | null>(null);
  protected readonly noteStatus = signal<NoteStatus>('idle');
  /** La note a été modifiée depuis le dernier alignement, ou elle a le focus. */
  private noteDirty = false;
  private noteFocused = false;
  /**
   * Brouillon de la note : réaligné sur le serveur quand le rendez-vous change, ou quand une
   * relecture apporte une autre note alors que le champ n'est ni en cours d'édition ni modifié.
   */
  protected readonly noteDraft = linkedSignal<{ id: string | null; note: string }, string>({
    source: () => ({
      id: this.appointment()?.id ?? null,
      note: this.appointment()?.planningNote ?? '',
    }),
    computation: (source, previous) =>
      previous && previous.source.id === source.id && (this.noteFocused || this.noteDirty)
        ? previous.value
        : source.note,
  });

  protected readonly moveForm = this.fb.group({
    date: ['', Validators.required],
    start: ['', [Validators.required, Validators.pattern(/^\d{1,2}:\d{2}$/)]],
    duration: [60, Validators.required],
  });
  protected readonly cancelForm = this.fb.group({
    reason: ['', Validators.maxLength(CANCEL_REASON_MAX)],
  });

  private readonly itemId = computed(() => this.appointment()?.id ?? null);
  private readonly patientId = computed(() => this.appointment()?.patient.id ?? null);

  constructor() {
    // Un autre rendez-vous (pas une relecture du même) : formulaires fermés, indicateurs à zéro.
    effect(() => {
      this.itemId();
      untracked(() => {
        this.mode.set('idle');
        this.actionError.set(null);
        this.noteStatus.set('idle');
        this.noteDirty = false;
      });
    });
    // Contexte du patient (bloc « Préparer », rythme) : lu une fois par patient.
    effect(() => {
      const id = this.patientId();
      if (id) untracked(() => void this.store.loadContext(id));
    });
  }

  protected readonly active = computed(() => {
    const item = this.appointment();
    return item !== null && isActive(item);
  });

  /** « Séance planifiée · cabinet », « À confirmer · visio », « Annulé · téléphone »… */
  protected readonly kicker = computed(() => {
    const item = this.appointment();
    if (!item) return '';
    const modality = modalityLabel(item.modality);
    switch (item.status) {
      case 'tentative':
        return $localize`:Étiquette du détail, à confirmer@@agenda.detail.kicker.tentative:À confirmer · ${modality}:modality:`;
      case 'cancelled':
        return $localize`:Étiquette du détail, annulé@@agenda.detail.kicker.cancelled:Annulé · ${modality}:modality:`;
      case 'done':
        return $localize`:Étiquette du détail, séance faite@@agenda.detail.kicker.done:Séance faite · ${modality}:modality:`;
      default:
        return $localize`:Étiquette du détail, séance planifiée@@agenda.detail.kicker.planned:Séance planifiée · ${modality}:modality:`;
    }
  });

  protected readonly initials = computed(() =>
    initials(this.appointment()?.patient.displayName ?? ''),
  );
  protected readonly patientLink = computed(() => [
    '/patients',
    this.appointment()?.patient.id ?? '',
  ]);

  /** Contexte du patient (bloc « Préparer », rythme), s'il est celui du rendez-vous ouvert. */
  private readonly context = computed(() => {
    const context = this.store.context();
    return context && context.patientId === this.appointment()?.patient.id ? context : null;
  });

  /** « 34 ans · suivi depuis mars 2025 · dossier archivé », sans ce qui est inconnu. */
  protected readonly patientMeta = computed(() => {
    const item = this.appointment();
    if (!item) return '';
    const parts: string[] = [];
    if (item.patient.age !== null) {
      parts.push(
        $localize`:Âge du patient dans le détail@@agenda.detail.age:${item.patient.age}:age: ans`,
      );
    }
    const since = this.context()?.preparation.data?.followedSince;
    if (since) {
      const month = formatMonthYear(since, this.locale);
      parts.push(
        $localize`:Début du suivi dans le détail@@agenda.detail.since:suivi depuis ${month}:month:`,
      );
    }
    if (item.patient.archived) {
      parts.push(
        $localize`:Patient archivé, dans le détail@@agenda.detail.archived:dossier archivé`,
      );
    }
    return parts.join(' · ');
  });

  protected readonly dateLabel = computed(() => {
    const item = this.appointment();
    return item ? formatWeekdayDate(new Date(item.startsAt), this.locale) : '';
  });
  protected readonly timeLabel = computed(() => {
    const item = this.appointment();
    return item ? formatSpacedTimeRange(item.startsAt, item.endsAt, this.locale) : '';
  });

  /** « Cabinet », « 50 min », « Rythme : toutes les 2 semaines ». */
  protected readonly facts = computed(() => {
    const item = this.appointment();
    if (!item) return [];
    const facts = [
      modalityTitle(item.modality),
      $localize`:Durée du rendez-vous dans le détail@@agenda.detail.duration:${item.durationMin}:minutes: min`,
    ];
    const rhythm = this.context()?.rhythm;
    if (rhythm) {
      facts.push(
        $localize`:Rythme du suivi dans le détail@@agenda.detail.rhythm:Rythme : ${rhythm}:rhythm:`,
      );
    }
    return facts;
  });

  /** « Annulé le 12 nov. à 09:14 · motif : empêchement » pour un rendez-vous annulé. */
  protected readonly cancelledLabel = computed(() => {
    const item = this.appointment();
    if (item?.status !== 'cancelled') return null;
    const at = item.cancelledAt ?? item.startsAt;
    const date = formatDayMonth(new Date(at), this.locale);
    const time = formatTime(at, this.locale);
    const base = $localize`:Rendez-vous annulé, date@@agenda.detail.cancelledAt:Annulé le ${date}:date: à ${time}:time:`;
    const reason = item.cancelReason?.trim();
    return reason
      ? $localize`:Rendez-vous annulé, date et motif@@agenda.detail.cancelledReason:${base}:base: (${reason}:reason:)`
      : base;
  });

  /** Bloc « Préparer » : en lecture, rempli, ou absent (erreur : seulement les liens). */
  protected readonly prepareState = computed(() => this.context()?.preparation.status ?? 'loading');
  protected readonly lastSession = computed(() => {
    const at = this.context()?.preparation.data?.lastSessionAt;
    return at ? formatDayMonth(new Date(at), this.locale) : null;
  });
  /** « 2 ressentis, 1 événement et 3 autres entrées » ; null s'il ne s'est rien passé. */
  protected readonly sinceLabel = computed(() => {
    const prep = this.context()?.preparation.data;
    if (!prep) return null;
    const parts: string[] = [];
    if (prep.feelings > 0) {
      parts.push(
        prep.feelings === 1
          ? $localize`:Un ressenti depuis la dernière séance@@agenda.detail.feelings.one:1 ressenti`
          : $localize`:Ressentis depuis la dernière séance@@agenda.detail.feelings.many:${prep.feelings}:count: ressentis`,
      );
    }
    if (prep.events > 0) {
      parts.push(
        prep.events === 1
          ? $localize`:Un événement depuis la dernière séance@@agenda.detail.events.one:1 événement`
          : $localize`:Événements depuis la dernière séance@@agenda.detail.events.many:${prep.events}:count: événements`,
      );
    }
    if (prep.others > 0) {
      parts.push(
        prep.others === 1
          ? $localize`:Une autre entrée depuis la dernière séance@@agenda.detail.others.one:1 autre entrée`
          : $localize`:Autres entrées depuis la dernière séance@@agenda.detail.others.many:${prep.others}:count: autres entrées`,
      );
    }
    return parts.length > 0 ? parts.join(', ') : null;
  });

  /** Durées du formulaire Déplacer : celles du panneau, plus la durée actuelle. */
  protected readonly durations = computed(() => {
    const current = this.appointment()?.durationMin;
    const list = new Set(DURATIONS_MIN);
    if (current) list.add(current);
    return [...list].sort((a, b) => a - b);
  });

  // --- Note de planification ------------------------------------------------------------------

  protected readonly noteStatusText = computed(() => {
    switch (this.noteStatus()) {
      case 'saving':
        return $localize`:Note en cours d'enregistrement@@agenda.detail.noteSaving:Enregistrement…`;
      case 'saved':
        return $localize`:Note enregistrée@@agenda.detail.noteSaved:Enregistré`;
      case 'error':
        return $localize`:Note non enregistrée@@agenda.detail.noteError:Non enregistré, réessayez.`;
      default:
        return '';
    }
  });

  protected editNote(value: string): void {
    this.noteDirty = true;
    this.noteDraft.set(value);
    if (this.noteStatus() === 'saved') this.noteStatus.set('idle');
  }

  protected focusNote(): void {
    this.noteFocused = true;
  }

  /** Au blur : `PATCH { planningNote }` si la note a changé ; vide → null (efface). */
  protected async saveNote(): Promise<void> {
    this.noteFocused = false;
    const item = this.appointment();
    if (!item || !this.active()) return;
    const value = this.noteDraft().trim();
    if (value === (item.planningNote ?? '').trim()) {
      this.noteDirty = false;
      return;
    }
    this.noteStatus.set('saving');
    const result = await this.store.saveNote(item.id, value === '' ? null : value);
    if (result.ok && this.appointment()?.id === item.id) this.noteDirty = false;
    this.noteStatus.set(result.ok ? 'saved' : 'error');
  }

  // --- Actions --------------------------------------------------------------------------------

  protected openMove(): void {
    const item = this.appointment();
    if (!item) return;
    const start = new Date(item.startsAt);
    this.moveForm.reset({
      date: toIsoDay(start),
      start: formatTime(start, this.locale),
      duration: item.durationMin,
    });
    this.actionError.set(null);
    this.mode.set('move');
    this.focusAfterRender(this.ids.date);
  }

  protected openCancel(): void {
    this.cancelForm.reset({ reason: '' });
    this.actionError.set(null);
    this.mode.set('cancel');
    this.focusAfterRender(this.ids.reason);
  }

  /** « Annuler » / « Garder » : le formulaire se ferme, le focus revient au bouton d'origine. */
  protected closeForm(): void {
    const origin = this.mode() === 'cancel' ? this.ids.cancelButton : this.ids.moveButton;
    this.mode.set('idle');
    this.actionError.set(null);
    this.focusAfterRender(origin);
  }

  private focusAfterRender(id: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus(),
      { injector: this.injector },
    );
  }

  /** « Déplacer » : `PATCH { startsAt, durationMin }`, puis relecture (équivalent du glisser). */
  protected async submitMove(): Promise<void> {
    const item = this.appointment();
    if (!item || this.busy()) return;
    const { date, start, duration } = this.moveForm.getRawValue();
    const startsAt = atLocal(date, start);
    if (this.moveForm.invalid || !startsAt) {
      this.moveForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    applyProblem(this.moveForm, null);
    const result = await this.store.move(item.id, startsAt.toISOString(), Number(duration));
    this.busy.set(false);
    if (!result.ok) {
      this.showMoveProblem(result.problem);
      return;
    }
    this.mode.set('idle');
    this.focusAfterRender(this.ids.moveButton);
    const conflicts = conflictMessage(result.conflicts, this.locale);
    this.toasts.info(
      conflicts ?? $localize`:Toast après un déplacement@@agenda.toast.moved:Rendez-vous déplacé.`,
    );
  }

  /** 422 : erreurs sous les champs (`startsAt` → Début, `durationMin` → Durée) ; sinon sur place. */
  private showMoveProblem(problem: ApiProblem): void {
    if (problem.status !== 422 || !problem.errors?.length) {
      this.actionError.set(problemText(problem));
      return;
    }
    const errors = problem.errors.map((error) => ({
      ...error,
      field: MOVE_FIELDS[error.field] ?? error.field,
    }));
    const { unmatched } = applyProblem(this.moveForm, { ...problem, errors });
    this.actionError.set(
      unmatched.length > 0 ? unmatched.map((error) => error.message).join(' ') : null,
    );
  }

  /** « Annuler » : motif facultatif, `POST …/cancel`, relecture, fermeture du détail. */
  protected async submitCancel(): Promise<void> {
    const item = this.appointment();
    if (!item || this.busy()) return;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }
    const reason = this.cancelForm.getRawValue().reason.trim();
    this.busy.set(true);
    const result = await this.store.cancel(item.id, reason || undefined);
    this.busy.set(false);
    if (!result.ok) {
      this.actionError.set(problemText(result.problem));
      return;
    }
    this.toasts.success(
      $localize`:Toast après une annulation@@agenda.toast.cancelled:Rendez-vous annulé.`,
    );
    this.closed.emit(item);
  }

  /** « Confirmer » (à confirmer seulement) : `POST …/confirm`, relecture ; 409 → toast. */
  protected async confirm(): Promise<void> {
    const item = this.appointment();
    if (!item || this.busy()) return;
    this.busy.set(true);
    const result = await this.store.confirm(item.id);
    this.busy.set(false);
    if (result.ok) {
      this.toasts.success(
        $localize`:Toast après une confirmation@@agenda.toast.confirmed:Rendez-vous confirmé.`,
      );
    } else {
      this.toasts.warning(problemText(result.problem));
    }
  }

  protected duplicate(): void {
    const item = this.appointment();
    if (item) this.duplicated.emit(item);
  }
}
