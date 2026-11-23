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
  viewChild,
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
  PatientOption,
  PLANNING_NOTE_MAX,
  toIsoDay,
} from '../data/agenda.model';
import { AgendaStore, DetailState } from '../data/agenda.store';
import {
  appointmentName,
  conflictMessage,
  formatDayMonth,
  formatSpacedTimeRange,
  formatTime,
  formatWeekdayDate,
  modalityLabel,
  modalityTitle,
  onlineMention,
} from './agenda-format';
import { OnlineGlobeComponent } from './online-globe.component';
import { PatientPickerComponent } from './patient-picker.component';

/** Champ du contrat (errors[].field d'un 422 du PATCH) → contrôle du formulaire Déplacer. */
const MOVE_FIELDS: Record<string, string> = { startsAt: 'start', durationMin: 'duration' };

/**
 * Ce que le détail a ouvert sous l'en-tête : rien, le formulaire Déplacer, l'annulation, ou
 * « Rattacher à un patient » (invité non purgé).
 */
type Mode = 'idle' | 'move' | 'cancel' | 'attach';

type NoteStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Le demandeur vient d'annuler sa demande : `409 APPOINTMENT_NOT_ACTIVE` sur une demande en attente. */
export function isWithdrawn(problem: ApiProblem): boolean {
  return problem.status === 409 && problem.code === 'APPOINTMENT_NOT_ACTIVE';
}

/** Deux motifs d'annulation identiques (absent, vide et null se valent). */
export function sameReason(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a?.trim() || null) === (b?.trim() || null);
}

/** `422 PATIENT_ARCHIVED` du rattachement : code du problème, ou d'une erreur de champ. */
export function isPatientArchived(problem: ApiProblem): boolean {
  return (
    problem.code === 'PATIENT_ARCHIVED' ||
    (problem.errors ?? []).some((error) => error.code === 'PATIENT_ARCHIVED')
  );
}

/** Le patient choisi n'est plus accessible au rattachement : `403` ou `404` du patient. */
export function isPatientUnavailable(problem: ApiProblem): boolean {
  return problem.code === 'PATIENT_FORBIDDEN' || problem.code === 'PATIENT_NOT_FOUND';
}

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
 * rendez-vous (lecture à part, 404, erreur), l'état est montré dans la carte. Rendez-vous invité
 * (contrat 0.13.0) : « Prénom Nom » ou « Invité purgé » en texte, sans initiales, lien, âge, « suivi
 * depuis », rythme ni bloc « Préparer » (tout cela vient du dossier), avec un bloc Contact (e-mail,
 * téléphone) ; déplacer, annuler, confirmer et la note fonctionnent comme pour un patient.
 * Demande en ligne (origine `online`, fiche 15 « Demandes en ligne ») : pastille « Demande en
 * ligne » ; en attente, « Refuser » (neutre) remplace « Annuler » et ouvre le formulaire
 * d'annulation sous le titre « Refuser cette demande ? » ; quand l'invité a un e-mail, les
 * formulaires disent que le demandeur sera prévenu (jamais du motif). `409 APPOINTMENT_NOT_ACTIVE`
 * à la confirmation d'une demande en attente (le demandeur vient d'annuler) : toast, relecture,
 * détail fermé. Au refus ou à l'annulation, l'API répond 200 sur un rendez-vous déjà annulé : un
 * motif renvoyé différent de celui envoyé le révèle (toast neutre, relecture, détail fermé).
 * Invité non purgé (M14-15, K3.2 étape 5) : « Rattacher à un patient » ouvre sur place le
 * sélecteur de patient du panneau 15b et la case « Rattacher aussi les autres rendez-vous de cette
 * personne » (`includeSameGuest`) ; `POST …/attach-patient`, relecture, le détail montre le
 * patient. 409 et 422 PATIENT_ARCHIVED en message sur place ; 403 / 404 du patient en toast.
 */
@Component({
  selector: 'pm-appointment-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    StateComponent,
    DateFieldComponent,
    FieldErrorsComponent,
    OnlineGlobeComponent,
    PatientPickerComponent,
  ],
  templateUrl: './appointment-detail.component.html',
  styleUrl: './appointment-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    // Reçoit le focus quand une demande est choisie dans le panneau « Demandes en ligne ».
    tabindex: '-1',
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
    reasonHint: uniqueId('agenda-cancel-hint'),
    moveForm: uniqueId('agenda-move-form'),
    cancelForm: uniqueId('agenda-cancel-form'),
    moveButton: uniqueId('agenda-move-button'),
    cancelButton: uniqueId('agenda-cancel-button'),
    attachForm: uniqueId('agenda-attach-form'),
    attachButton: uniqueId('agenda-attach-button'),
    attachPatient: uniqueId('agenda-attach-patient'),
    attachHint: uniqueId('agenda-attach-hint'),
    patientLink: uniqueId('agenda-patient-link'),
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
  /** « Rattacher à un patient » : le patient choisi (seul son identifiant part) et la case. */
  protected readonly attachForm = this.fb.group({
    patientId: ['', Validators.required],
    includeSameGuest: [false],
  });
  /** Patient choisi dans le sélecteur, montré en carte. */
  protected readonly attachChosen = signal<PatientOption | null>(null);
  private readonly picker = viewChild(PatientPickerComponent);
  /** Rattachement réussi : le lien du dossier prend le focus dès que le patient est affiché. */
  private readonly focusPatientLink = signal(false);

  private readonly itemId = computed(() => this.appointment()?.id ?? null);
  /** Patient du rendez-vous ouvert ; null pour un invité ; undefined sans rendez-vous. */
  private readonly patientId = computed(() => {
    const item = this.appointment();
    return item ? (item.patient?.id ?? null) : undefined;
  });

  constructor() {
    // Un autre rendez-vous (pas une relecture du même) : formulaires fermés, indicateurs à zéro.
    effect(() => {
      this.itemId();
      untracked(() => {
        this.mode.set('idle');
        this.actionError.set(null);
        this.noteStatus.set('idle');
        this.noteDirty = false;
        this.focusPatientLink.set(false);
      });
    });
    // Après un rattachement, la relecture apporte le patient : son lien prend le focus.
    effect(() => {
      if (!this.focusPatientLink() || !this.appointment()?.patient) return;
      untracked(() => {
        this.focusPatientLink.set(false);
        this.focusAfterRender(this.ids.patientLink);
      });
    });
    // Contexte du patient (bloc « Préparer », rythme) : lu une fois par patient ; aucun pour un
    // invité (null efface celui du patient précédent).
    effect(() => {
      const id = this.patientId();
      if (id !== undefined) untracked(() => void this.store.loadContext(id));
    });
  }

  /** Rendez-vous pris en ligne (origine `online`), confirmé ou non. */
  protected readonly online = computed(() => this.appointment()?.origin === 'online');
  /** Demande en ligne qui attend la réponse du praticien : « Refuser » à la place d'« Annuler ». */
  protected readonly pendingRequest = computed(
    () => this.online() && this.appointment()?.status === 'tentative',
  );
  /**
   * Le serveur prévient le demandeur par e-mail (rendez-vous en ligne dont l'invité a un e-mail) :
   * plus rien ne part après une purge ou un rattachement à un patient.
   */
  protected readonly notifiesRequester = computed(
    () => this.online() && !!this.appointment()?.guest?.email,
  );

  protected readonly onlineLabel = onlineMention();

  /** Contact de l'invité (e-mail, téléphone), chacun absent quand il est inconnu ou purgé. */
  protected readonly contact = computed(() => {
    const guest = this.appointment()?.guest;
    if (!guest || guest.purgedAt) return null;
    const email = guest.email;
    const phone = guest.phone;
    if (!email && !phone) return null;
    return {
      email,
      phone,
      phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
    };
  });

  /** Textes du formulaire d'annulation : « Refuser cette demande ? » pour une demande en attente. */
  protected readonly cancelTexts = computed(() => {
    if (this.pendingRequest()) {
      return {
        title: $localize`:Titre de la confirmation du refus d'une demande en ligne@@agenda.detail.refuseTitle:Refuser cette demande ?`,
        submit: $localize`:Confirmer le refus d'une demande en ligne@@agenda.detail.refuseSubmit:Refuser la demande`,
        hint: this.notifiesRequester()
          ? $localize`:Refus d'une demande en ligne, ce que reçoit le demandeur@@agenda.detail.refuseHint:Le demandeur sera prévenu par e-mail. Le motif reste dans votre agenda : il ne lui est jamais transmis.`
          : null,
      };
    }
    return {
      title: $localize`:Titre de la confirmation d'annulation@@agenda.detail.cancelTitle:Annuler ce rendez-vous ?`,
      submit: $localize`:Confirmer l'annulation@@agenda.detail.cancelSubmit:Annuler le rendez-vous`,
      hint: this.notifiesRequester()
        ? `${this.notifiedText} ${$localize`:Annulation d'un rendez-vous en ligne, le motif@@agenda.detail.cancelReasonPrivate:Le motif ne lui est jamais transmis.`}`
        : null,
    };
  });
  /** « Le demandeur sera prévenu par e-mail. » (Déplacer, Annuler d'un rendez-vous en ligne). */
  protected readonly notifiedText = $localize`:Rendez-vous en ligne, le demandeur reçoit un e-mail@@agenda.detail.requesterNotified:Le demandeur sera prévenu par e-mail.`;

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

  /** Nom du patient, ou de l'invité (« Invité purgé » après la purge). */
  protected readonly name = computed(() => {
    const item = this.appointment();
    return item ? appointmentName(item) : '';
  });
  protected readonly initials = computed(() =>
    initials(this.appointment()?.patient?.displayName ?? ''),
  );
  protected readonly patientLink = computed(() => [
    '/patients',
    this.appointment()?.patient?.id ?? '',
  ]);

  /** Contexte du patient (bloc « Préparer », rythme), s'il est celui du rendez-vous ouvert. */
  private readonly context = computed(() => {
    const context = this.store.context();
    const patientId = this.appointment()?.patient?.id;
    return context && patientId && context.patientId === patientId ? context : null;
  });

  /**
   * « 34 ans · suivi depuis mars 2025 · dossier archivé », sans ce qui est inconnu. Invité :
   * « invité · 06 12 34 56 78 » (téléphone s'il est connu) ; rien après la purge.
   */
  protected readonly patientMeta = computed(() => {
    const item = this.appointment();
    if (!item) return '';
    if (!item.patient) {
      if (!item.guest || item.guest.purgedAt) return '';
      // Le téléphone et l'e-mail sont dans le bloc Contact.
      return $localize`:Rendez-vous invité (personne sans dossier patient), dans le détail@@agenda.detail.guest:invité`;
    }
    const parts: string[] = [];
    if (item.patient.age !== null) parts.push(this.ageText(item.patient.age));
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

  private ageText(age: number): string {
    return $localize`:Âge du patient dans le détail@@agenda.detail.age:${age}:age: ans`;
  }

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

  /**
   * « Annulé le 12 nov. à 09:14 », suivi du motif entre parenthèses s'il y en a un (le gabarit
   * l'isole dans un `<bdi>` : texte saisi) ; null si le rendez-vous n'est pas annulé.
   */
  protected readonly cancelledLabel = computed(() => {
    const item = this.appointment();
    if (item?.status !== 'cancelled') return null;
    const at = item.cancelledAt ?? item.startsAt;
    const date = formatDayMonth(new Date(at), this.locale);
    const time = formatTime(at, this.locale);
    const base = $localize`:Rendez-vous annulé, date@@agenda.detail.cancelledAt:Annulé le ${date}:date: à ${time}:time:`;
    return { base, reason: item.cancelReason?.trim() || null };
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

  // --- Rattacher à un patient ----------------------------------------------------------------

  /**
   * Invité non purgé : l'action « Rattacher à un patient » est offerte, quel que soit le statut
   * (l'API rattache aussi un rendez-vous annulé ou fait ; elle refuse un patient ou un purgé).
   */
  protected readonly attachable = computed(() => {
    const item = this.appointment();
    return !!item && !item.patient && !!item.guest && !item.guest.purgedAt;
  });
  /** Ligne sous le nom du patient choisi : son âge, s'il est connu. */
  protected readonly attachMeta = computed(() => {
    const age = this.attachChosen()?.age;
    return age === null || age === undefined ? '' : this.ageText(age);
  });
  /**
   * Demande en ligne dont l'invité a un e-mail : le rattachement efface les coordonnées de
   * l'invité, et les e-mails automatiques au demandeur s'arrêtent (K3.4).
   */
  protected readonly attachStopsEmails = $localize`:Rattachement d'une demande en ligne, fin des e-mails au demandeur@@agenda.attach.stopsEmails:Après le rattachement, le demandeur ne recevra plus d'e-mails automatiques.`;

  protected openAttach(): void {
    this.attachForm.reset({ patientId: '', includeSameGuest: false });
    this.attachChosen.set(null);
    this.actionError.set(null);
    this.mode.set('attach');
    this.focusAfterRender(this.ids.attachPatient);
  }

  protected chooseAttach(patient: PatientOption): void {
    this.attachChosen.set(patient);
    this.attachForm.controls.patientId.setValue(patient.id);
    this.actionError.set(null);
  }

  /**
   * Échap dans le formulaire « Rattacher » : le formulaire se ferme et rend le focus à l'action (le
   * détail reste ouvert). La liste des patients ouverte prend Échap avant lui.
   */
  protected escapeAttach(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.busy()) this.closeForm();
  }

  /**
   * « Rattacher » : `POST …/attach-patient`, relecture de la plage et des demandes. Succès : toast,
   * le détail montre le patient et son lien (focus posé dessus). 409 et 422 PATIENT_ARCHIVED :
   * message sur place ; 403 / 404 du patient : toast, choix effacé ; autre échec (réseau) : message
   * sur place, saisie gardée, action rejouable.
   */
  protected async submitAttach(): Promise<void> {
    const item = this.appointment();
    if (!item || this.busy()) return;
    if (this.attachForm.invalid) {
      this.attachForm.markAllAsTouched();
      this.picker()?.focus();
      return;
    }
    const { patientId, includeSameGuest } = this.attachForm.getRawValue();
    const chosen = this.attachChosen();
    this.busy.set(true);
    this.actionError.set(null);
    const result = await this.store.attachPatient(item.id, patientId, includeSameGuest);
    this.busy.set(false);
    if (result.ok) {
      this.mode.set('idle');
      const count = Math.max(result.value.length, 1);
      const name = result.value[0]?.patient?.displayName || chosen?.displayName || '';
      this.toasts.success(
        count === 1
          ? $localize`:Toast après le rattachement d'un rendez-vous invité à un patient@@agenda.toast.attached:Rendez-vous rattaché : ${name}:name:`
          : $localize`:Toast après le rattachement de plusieurs rendez-vous d'un invité à un patient@@agenda.toast.attachedMany:${count}:count: rendez-vous rattachés : ${name}:name:`,
      );
      this.focusPatientLink.set(true);
      return;
    }
    this.showAttachProblem(result.problem);
  }

  private showAttachProblem(problem: ApiProblem): void {
    if (problem.status === 409 && problem.code === 'APPOINTMENT_NOT_ACTIVE') {
      this.actionError.set(
        $localize`:Rattachement refusé, le rendez-vous vise déjà un patient ou l'invité est purgé@@agenda.attach.notActive:Ce rendez-vous ne peut plus être rattaché : il vise déjà un patient, ou les coordonnées de l'invité ont été effacées.`,
      );
      return;
    }
    if (problem.status === 422 && isPatientArchived(problem)) {
      this.actionError.set(
        $localize`:Rattachement refusé, patient archivé@@agenda.attach.archived:Ce patient est archivé : choisissez un patient actif.`,
      );
      return;
    }
    if (isPatientUnavailable(problem)) {
      this.attachChosen.set(null);
      this.attachForm.controls.patientId.setValue('');
      this.toasts.warning(
        $localize`:Rattachement refusé, patient inaccessible@@agenda.attach.patientUnavailable:Ce patient n'est plus accessible : choisissez-en un autre.`,
      );
      this.focusAfterRender(this.ids.attachPatient);
      return;
    }
    if (problem.status === 403 || problem.status === 404) {
      // Le rendez-vous lui-même n'est plus accessible : la relecture a mis le détail à jour.
      this.mode.set('idle');
      this.toasts.warning(problemText(problem));
      return;
    }
    this.actionError.set(problemText(problem));
  }

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
    const origins: Record<Mode, string> = {
      idle: this.ids.moveButton,
      move: this.ids.moveButton,
      cancel: this.ids.cancelButton,
      attach: this.ids.attachButton,
    };
    const origin = origins[this.mode()];
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
    const refusing = this.pendingRequest();
    const online = this.online();
    const notifies = this.notifiesRequester();
    this.busy.set(true);
    const result = await this.store.cancel(item.id, reason || undefined);
    this.busy.set(false);
    if (!result.ok) {
      this.actionError.set(problemText(result.problem));
      return;
    }
    // `POST …/cancel` est idempotent : sur un rendez-vous déjà annulé (le demandeur vient
    // d'annuler), il répond 200 avec le motif d'origine. Un motif renvoyé différent de celui
    // envoyé dit que rien n'a changé : aucun e-mail n'est parti, le motif n'est pas enregistré.
    if (online && !sameReason(result.value.cancelReason, reason)) {
      this.mode.set('idle');
      this.toasts.info(
        refusing
          ? $localize`:Toast quand une demande en ligne refusée était déjà annulée par le demandeur@@agenda.toast.alreadyCancelledRequest:Cette demande était déjà annulée.`
          : $localize`:Toast quand un rendez-vous en ligne était déjà annulé par le demandeur@@agenda.toast.alreadyCancelled:Ce rendez-vous était déjà annulé.`,
      );
      this.closed.emit(item);
      return;
    }
    if (refusing && notifies) {
      this.toasts.success(
        $localize`:Toast après le refus d'une demande en ligne@@agenda.toast.refused:Demande refusée. Le demandeur est prévenu par e-mail.`,
      );
    } else {
      this.toasts.success(
        $localize`:Toast après une annulation@@agenda.toast.cancelled:Rendez-vous annulé.`,
      );
    }
    this.closed.emit(item);
  }

  /**
   * La demande n'est plus en attente : le demandeur vient de l'annuler. La plage et les demandes
   * ont été relues par le store ; le détail se ferme.
   */
  private withdrawn(item: Appointment): void {
    this.mode.set('idle');
    this.toasts.warning(
      $localize`:Toast quand une demande en ligne vient d'être annulée par le demandeur@@agenda.toast.withdrawn:Cette demande n'est plus en attente : elle vient d'être annulée.`,
    );
    this.closed.emit(item);
  }

  /** « Confirmer » (à confirmer seulement) : `POST …/confirm`, relecture ; 409 → toast. */
  protected async confirm(): Promise<void> {
    const item = this.appointment();
    if (!item || this.busy()) return;
    const request = this.pendingRequest();
    const notifies = this.notifiesRequester();
    this.busy.set(true);
    const result = await this.store.confirm(item.id);
    this.busy.set(false);
    if (result.ok) {
      this.toasts.success(
        request && notifies
          ? $localize`:Toast après la confirmation d'une demande en ligne@@agenda.toast.confirmedRequest:Rendez-vous confirmé. Le demandeur est prévenu par e-mail.`
          : $localize`:Toast après une confirmation@@agenda.toast.confirmed:Rendez-vous confirmé.`,
      );
    } else if (request && isWithdrawn(result.problem)) {
      this.withdrawn(item);
    } else {
      this.toasts.warning(problemText(result.problem));
    }
  }

  protected duplicate(): void {
    const item = this.appointment();
    if (item) this.duplicated.emit(item);
  }
}
