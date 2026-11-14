import { DOCUMENT, Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  ageInYears,
  formatDate,
  formatRelativeDay,
  subjectLabel,
  SubjectVocabulary,
} from '../../../core/i18n';
import { ApiProblem, FieldProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import {
  applyProblem,
  fieldId,
  FieldErrorsComponent,
  firstInvalidField,
} from '../../../shared/forms';
import {
  ConfirmDialogService,
  FormErrorsComponent,
  SidePanelService,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { DateFieldComponent, MonthFieldComponent, toIsoDate } from '../../../shared/ui/date-field';
import { stateKind } from '../../../shared/util';
import { CAPTURE_FOCUS_STATE } from '../../patient-shell';
import { PatientListStore } from '../data/patient-list.store';
import {
  diffPatient,
  emptyForm,
  FlagKind,
  formFlags,
  MODALITIES,
  PatientFormValue,
  PatientView,
  PRONOUNS,
  RHYTHMS,
  toCreateInput,
  toFormValue,
} from '../data/patient.model';
import { PatientStore } from '../data/patient.store';
import { TagStore } from '../data/tag.store';
import { PatientVersionsPanel, PatientVersionsPanelData } from '../panels/version-history.panel';
import { PatientExportMenuComponent } from '../ui/export-menu.component';
import { FlagFieldsComponent } from '../ui/flag-fields.component';
import { HeaderPreviewComponent } from '../ui/header-preview.component';
import { buildPatientForm, readPatientForm, toFormProblem } from '../ui/patient-form';
import {
  archivedMessage,
  fieldLabel,
  modalityLabel,
  pronounLabel,
  RESTORE_LABEL,
  restoredMessage,
  rhythmLabel,
  writeProblemMessage,
} from '../ui/patient-labels';
import { RailSection, RecordRailComponent } from '../ui/record-rail.component';
import { TagEditorComponent } from '../ui/tag-editor.component';

/** Sections du formulaire, dans l'ordre de la page et du rail (proposition 16). */
const SECTION_IDS = ['identite', 'contexte', 'suivi', 'drapeaux', 'tags', 'archivage'] as const;
type SectionId = (typeof SECTION_IDS)[number];

/** Une section devient « courante » quand son haut passe au-dessus de cette ligne (px). */
const CURRENT_LINE = 96;

/**
 * /patients/nouveau et /patients/:id/fiche (fiche 16, proposition 16, UX-S10) : un seul formulaire
 * pour créer et modifier, en pleine largeur. À gauche un rail collant (aperçu de l'en-tête, liens
 * vers les sections avec la section courante, Enregistrer toujours visible, champs modifiés) ; à
 * droite une surface continue, sections séparées par un titre et un filet. Validation à la
 * soumission (focus sur le premier champ fautif) ; un 422 se lit sous les champs (applyProblem) et
 * dans le résumé en tête, qui prend le focus et mène à chaque champ (UX-A7). Ctrl/Cmd+Entrée
 * enregistre. Export et historique des versions (panneau) dans l'en-tête ; archivage en bas du
 * formulaire, nom à retaper, retour à la liste avec « Restaurer ».
 */
@Component({
  selector: 'pm-patient-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FieldErrorsComponent,
    FormErrorsComponent,
    DateFieldComponent,
    MonthFieldComponent,
    StateComponent,
    FlagFieldsComponent,
    HeaderPreviewComponent,
    PatientExportMenuComponent,
    RecordRailComponent,
    TagEditorComponent,
  ],
  providers: [PatientStore],
  // Ctrl/Cmd+Entrée enregistre depuis tout point de la page (champs, rail, en-tête).
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './patient-form.page.html',
  styleUrl: './patient-form.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientFormPage {
  /** Paramètre de route :id ; absent sur /patients/nouveau. */
  readonly id = input<string>();

  protected readonly store = inject(PatientStore);
  protected readonly tagStore = inject(TagStore);
  private readonly list = inject(PatientListStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly vocabulary = inject(SubjectVocabulary);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly location = inject(Location);
  private readonly panels = inject(SidePanelService);
  private readonly preferences = inject(PreferencesStore);

  protected readonly form = buildPatientForm(
    inject(NonNullableFormBuilder),
    emptyForm(this.preferences.defaultDurationMin()),
  );
  /** Id du formulaire : le bouton Enregistrer du rail lui est relié par l'attribut `form`. */
  protected readonly formId = 'patient-form';
  protected readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly tags = signal<string[]>([]);
  protected readonly tagDraft = signal('');
  /**
   * errors[] du dernier 422, résumées en tête (pm-form-errors, UX-A7) ; les champs sans contrôle
   * du formulaire (tags[i]…) y restent en texte, sans lien. Message d'une autre erreur à part.
   */
  protected readonly serverErrors = signal<FieldProblem[]>([]);
  protected readonly unmatchedFields = signal<string[]>([]);
  protected readonly message = signal<string | null>(null);

  protected readonly fid = fieldId;
  protected readonly pronouns = PRONOUNS.map((value) => ({ value, label: pronounLabel(value) }));
  protected readonly rhythms = RHYTHMS.map((value) => ({ value, label: rhythmLabel(value) }));
  protected readonly modalities = MODALITIES.map((value) => ({
    value,
    label: modalityLabel(value),
  }));
  protected readonly labels = Object.fromEntries(
    [
      'displayName',
      'birthDate',
      'firstName',
      'lastName',
      'pronoun',
      'phone',
      'email',
      'context.situation',
      'context.activity',
      'context.referredBy',
      'context.initialReason',
      'context.history',
      'followUp.since',
      'followUp.rhythm',
      'followUp.modality',
      'followUp.durationMin',
      'followUp.fee',
      'followUp.prescriber',
      'flags.watchReason',
    ].map((field) => [field, fieldLabel(field)]),
  );
  protected readonly sectionLabels = SECTION_LABELS;

  protected readonly editing = computed(() => !!this.id());
  protected readonly patient = this.store.current;
  protected readonly loadState = computed(() =>
    this.editing() ? stateKind(this.store.patient()) : null,
  );
  protected readonly historyState = computed(() =>
    stateKind(this.store.versions(), (versions) => versions.length === 0),
  );
  protected readonly readOnly = computed(() => this.store.archived());

  protected readonly title = computed(() => {
    const patient = this.patient();
    if (this.editing() && patient) {
      return $localize`:Titre de la fiche en modification@@patients.form.editTitle:Fiche · ${patient.displayName}:name:`;
    }
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return $localize`:Titre de la fiche en création@@patients.form.newTitle:Nouveau ${subject}:subject:`;
  });
  protected readonly subjects = computed(() => subjectLabel(this.vocabulary.label(), 'Many'));
  protected readonly meta = computed(() =>
    metaText(this.patient(), this.store.sessionCount(), this.locale),
  );
  /** « dernière modification il y a 3 j » : seulement après une première modification. */
  protected readonly updatedText = computed(() => updatedLabel(this.patient(), this.locale));
  protected readonly versionsText = computed(() => versionsLabel(this.patient()?.currentVersion));
  /** Borne du calendrier de la date de naissance (la règle reste au validateur). */
  protected readonly today = toIsoDate(new Date(), 'day');
  /** Aide de la date de naissance : « 35 ans · l'âge et les phases de vie en découlent ». */
  protected readonly birthHint = computed(() => {
    const age = ageInYears(this.value().birthDate || null);
    return age === null
      ? $localize`:Aide de la date de naissance@@patients.form.birthDate.hint:L'âge et les phases de vie en découlent`
      : $localize`:Aide de la date de naissance avec l'âge@@patients.form.birthDate.hintAge:${age}:age: ans · l'âge et les phases de vie en découlent`;
  });
  /** Aide de la durée : la préférence du compte, valeur par défaut d'un nouveau dossier. */
  protected readonly durationHint = computed(() => {
    const minutes = this.preferences.defaultDurationMin();
    return $localize`:Aide de la durée de séance@@patients.form.duration.hint:préférence du compte : ${minutes}:minutes: min`;
  });
  /** Date de pose des drapeaux actifs de la fiche lue (« Posé le 3 oct. »). */
  protected readonly flagSetAt = computed(() => {
    const setAt: Partial<Record<FlagKind, string | null>> = {};
    for (const flag of this.patient()?.flags ?? []) setAt[flag.kind] = flag.setAt;
    return setAt;
  });
  protected readonly previewFlags = computed(() =>
    formFlags(this.value().flags as PatientFormValue['flags']).map((flag) => ({
      kind: flag.kind,
      reason: flag.reason ?? null,
      setAt: this.patient()?.flags.find((f) => f.kind === flag.kind)?.setAt ?? null,
    })),
  );
  protected readonly tagMessage = computed(() => {
    const problem = this.tagStore.problem();
    return problem ? problemText(problem) : null;
  });

  /** Section courante du rail (défilement, ou dernier lien suivi). */
  protected readonly currentSection = signal<SectionId>('identite');
  /** Après un lien du rail, le défilement qu'il provoque ne change pas la section choisie. */
  private spyPausedUntil = 0;
  /** Adresse de la page avec la base (/fr/…) : les liens du rail restent de vraies ancres. */
  protected readonly pageHref = computed(() => {
    const id = this.id();
    const tree = this.router.createUrlTree(
      id ? ['/patients', id, 'fiche'] : ['/patients', 'nouveau'],
    );
    return this.location.prepareExternalUrl(this.router.serializeUrl(tree));
  });

  /** Champs modifiés depuis la dernière lecture (modification seulement), tels qu'envoyés. */
  protected readonly modifiedCount = computed(() => {
    this.value();
    const tags = this.tags();
    const patient = this.patient();
    if (!this.editing() || !patient) return 0;
    const changes = diffPatient(patient, readPatientForm(this.form), tags);
    const flags = new Set([
      ...changes.flagsToClear,
      ...changes.flagsToSet.map((flag) => flag.kind),
    ]);
    return leafCount(changes.patch) + flags.size + (changes.tags ? 1 : 0);
  });

  /** Liens du rail : sections et décompte des champs renseignés (proposition 16). */
  protected readonly sections = computed<RailSection[]>(() => {
    const value = this.value();
    const identity = filled([
      value.displayName,
      value.firstName,
      value.lastName,
      value.birthDate,
      value.pronoun,
      value.phone,
      value.email,
    ]);
    const context = filled(Object.values(value.context ?? {}));
    const followUp = filled(Object.values(value.followUp ?? {}));
    const flags = [value.flags?.watch, value.flags?.risk, value.flags?.sharedCare].filter(
      Boolean,
    ).length;
    const tags = this.tags().length;
    const sections: RailSection[] = [
      {
        id: 'identite',
        label: SECTION_LABELS.identite(),
        count: identity ? fieldsCount(identity) : '',
        countSuffix: filledSuffix(identity),
      },
      {
        id: 'contexte',
        label: SECTION_LABELS.contexte(),
        count: context ? String(context) : '',
        countSuffix: fieldsFilledSuffix(context),
      },
      {
        id: 'suivi',
        label: SECTION_LABELS.suivi(),
        count: followUp ? String(followUp) : '',
        countSuffix: fieldsFilledSuffix(followUp),
      },
      {
        id: 'drapeaux',
        label: SECTION_LABELS.drapeaux(),
        count: flags ? flagsCount(flags) : '',
        countSuffix: '',
      },
      {
        id: 'tags',
        label: SECTION_LABELS.tags(),
        count: tags ? String(tags) : '',
        countSuffix: tagsSuffix(tags),
      },
    ];
    if (this.patient() && !this.readOnly()) {
      sections.push({
        id: 'archivage',
        label: SECTION_LABELS.archivage(),
        count: '',
        countSuffix: '',
        quiet: true,
      });
    }
    return sections;
  });

  protected readonly saveLabel = computed(() =>
    this.editing()
      ? $localize`:Bouton enregistrer@@patients.form.save:Enregistrer`
      : $localize`:Bouton de création du dossier@@patients.form.create:Créer le dossier`,
  );
  protected readonly cancelLabel = computed(() =>
    this.editing()
      ? $localize`:Bouton qui annule les modifications de la fiche@@patients.form.discard:Annuler les modifications`
      : $localize`:Bouton annuler@@patients.form.cancel:Annuler`,
  );
  /** Sous les boutons du rail : « 2 champs modifiés · chaque enregistrement crée une version horodatée. » */
  protected readonly railNote = computed(() => {
    const count = this.modifiedCount();
    if (count === 0) {
      return $localize`:Mention sous Enregistrer@@patients.form.stamp:Chaque enregistrement crée une version horodatée.`;
    }
    return count > 1
      ? $localize`:Mention sous Enregistrer, plusieurs champs modifiés@@patients.form.stamp.many:${count}:count: champs modifiés · chaque enregistrement crée une version horodatée.`
      : $localize`:Mention sous Enregistrer, un champ modifié@@patients.form.stamp.one:1 champ modifié · chaque enregistrement crée une version horodatée.`;
  });

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.load(),
  };
  protected readonly loadErrorTitle = $localize`:État erreur de la fiche@@patients.form.loadError:Impossible de charger cette fiche`;

  constructor() {
    this.tagStore.clearProblem();
    void this.tagStore.load();
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
    this.followScroll();
  }

  protected async load(id = this.id()): Promise<void> {
    if (!id) return;
    await this.store.load(id);
    const patient = this.store.current();
    if (patient) this.fill(patient);
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  /** Ctrl/Cmd+Entrée enregistre depuis n'importe quel champ ou lien de la fiche (fiche 16). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.submit();
    }
  }

  protected async submit(): Promise<void> {
    if (this.store.busy() || this.readOnly()) return;
    this.message.set(null);
    this.serverErrors.set([]);
    this.unmatchedFields.set([]);
    this.form.controls.flags.controls.watchReason.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    if (!(await this.commitTagDraft())) return;
    const value = readPatientForm(this.form);
    const patient = this.patient();
    if (!patient) {
      const created = await this.store.create(toCreateInput(value, this.tags()));
      if (created) {
        // Le dossier s'ouvre avec la barre de capture focalisée (B3 flux 2, étape 3).
        await this.router.navigate(['/patients', created.id, 'overview'], {
          state: { [CAPTURE_FOCUS_STATE]: true },
        });
        return;
      }
    } else {
      const saved = await this.store.update(diffPatient(patient, value, this.tags()));
      if (saved) {
        this.fill(this.store.current() ?? patient);
        this.toasts.success(
          $localize`:Toast après enregistrement de la fiche@@patients.form.saved:Fiche enregistrée`,
        );
        return;
      }
    }
    this.showProblem(this.store.saveProblem());
  }

  /**
   * Modification : « Annuler les modifications » remet la fiche lue, rien n'est envoyé. Création :
   * « Annuler » revient à la liste.
   */
  protected cancel(): void {
    const patient = this.patient();
    if (!this.editing() || !patient) {
      void this.router.navigate(['/patients']);
      return;
    }
    this.message.set(null);
    this.serverErrors.set([]);
    this.unmatchedFields.set([]);
    this.tagDraft.set('');
    this.tagStore.clearProblem();
    this.fill(patient);
  }

  /** Lien du rail : défile jusqu'à la section et met le focus sur son titre. */
  protected goToSection(id: string): void {
    const target = this.document.getElementById(`section-${id}`);
    if (!target) return;
    this.currentSection.set(id as SectionId);
    this.spyPausedUntil = Date.now() + 300;
    target.scrollIntoView({ block: 'start' });
    this.document.getElementById(`section-${id}-title`)?.focus({ preventScroll: true });
  }

  /** « Historique des versions » (en-tête, lien « n versions » de la méta) : panneau latéral. */
  protected openHistory(): void {
    const patient = this.patient();
    if (!patient) return;
    this.panels.open<PatientVersionsPanel, PatientVersionsPanelData>(PatientVersionsPanel, {
      width: 420,
      data: {
        name: patient.displayName,
        history: this.store.history,
        state: this.historyState,
        retry: () => this.retryHistory(),
      },
    });
  }

  protected async addTag(label: string): Promise<boolean> {
    const tag = await this.tagStore.resolve(label);
    if (!tag) return false;
    if (!this.tags().includes(tag.label)) this.tags.update((tags) => [...tags, tag.label]);
    this.tagDraft.set('');
    return true;
  }

  /**
   * Libellé tapé dans « Ajouter un tag… » sans Entrée : ajouté comme tag avant l'envoi (même
   * résolution que la touche Entrée). Refusé (émotion, erreur) → envoi bloqué, message sous le
   * champ des tags, focus dessus. Un brouillon vide après normalisation (« # ») est ignoré.
   */
  private async commitTagDraft(): Promise<boolean> {
    const draft = this.tagDraft().trim();
    if (!draft) return true;
    if (await this.addTag(draft)) return true;
    if (!this.tagStore.problem()) {
      this.tagDraft.set('');
      return true;
    }
    afterNextRender(() => this.document.getElementById('field-tags')?.focus(), {
      injector: this.injector,
    });
    return false;
  }

  protected removeTag(label: string): void {
    this.tags.update((tags) => tags.filter((tag) => tag !== label));
  }

  /** Zone d'archivage : nom exact à retaper, DELETE, retour à la liste avec « Restaurer ». */
  protected async archive(): Promise<void> {
    const patient = this.patient();
    if (!patient) return;
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    const confirmed = await this.confirm.confirm({
      title: $localize`:Titre de la confirmation d'archivage@@patients.archive.confirmTitle:Archiver ${patient.displayName}:name: ?`,
      description: $localize`:Explication de l'archivage@@patients.archive.confirmText:Le dossier disparaît de la liste ; rien n'est supprimé et vous pourrez le restaurer.`,
      confirmLabel: $localize`:Bouton de confirmation d'archivage@@patients.archive.confirm:Archiver ce ${subject}:subject:`,
      destructive: true,
      confirmWord: patient.displayName,
    });
    if (!confirmed || !(await this.store.archive())) {
      if (this.store.archiveProblem()) this.message.set(problemText(this.store.archiveProblem()));
      return;
    }
    await this.router.navigate(['/patients']);
    this.toasts.show({
      level: 'info',
      message: archivedMessage(patient.displayName, patient.pronoun),
      durationMs: 10_000,
      action: {
        label: RESTORE_LABEL(),
        handler: () => void this.restoreFromList(patient),
      },
    });
  }

  protected async restore(): Promise<void> {
    if (!(await this.store.restore())) {
      this.message.set(problemText(this.store.archiveProblem()));
      return;
    }
    const patient = this.store.current();
    if (!patient) return;
    this.fill(patient);
    this.toasts.success(restoredMessage(patient.displayName, patient.pronoun));
  }

  private async restoreFromList(patient: PatientView): Promise<void> {
    const restored = await this.list.restore(patient.id);
    if (restored) this.toasts.success(restoredMessage(restored.displayName, restored.pronoun));
  }

  protected retryHistory(): void {
    const id = this.patient()?.id;
    if (id) void this.store.loadVersions(id);
  }

  private fill(patient: PatientView): void {
    this.form.reset(toFormValue(patient));
    if (patient.archivedAt) this.form.disable();
    else this.form.enable();
    this.tags.set(patient.tags.map((tag) => tag.label));
  }

  private showProblem(problem: ApiProblem | null): void {
    if (!problem) return;
    if (problem.status === 422 && problem.errors?.length) {
      // Messages sous les champs, résumé en tête : il prend le focus, ses liens mènent aux champs.
      const formProblem = toFormProblem(problem);
      const { unmatched } = applyProblem(this.form, formProblem);
      this.unmatchedFields.set(unmatched.map((error) => error.field));
      this.serverErrors.set(formProblem.errors ?? []);
      return;
    }
    if (problem.code === 'FLAG_ALREADY_ACTIVE') void this.load();
    this.message.set(
      problem.status === 422 ? problemText(problem) : writeProblemMessage(problem.code),
    );
  }

  /**
   * Section courante au défilement : la dernière dont le haut a passé la ligne CURRENT_LINE ; en bas
   * de page, la dernière section. Écoute passive, un calcul par image.
   */
  private followScroll(): void {
    const view = this.document.defaultView;
    if (!view) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < this.spyPausedUntil) return;
      const present = SECTION_IDS.filter((id) => this.document.getElementById(`section-${id}`));
      if (present.length === 0) return;
      const root = this.document.documentElement;
      if (view.scrollY > 0 && view.scrollY + view.innerHeight >= root.scrollHeight - 2) {
        this.currentSection.set(present[present.length - 1]);
        return;
      }
      let current: SectionId = present[0];
      for (const id of present) {
        const top = this.document.getElementById(`section-${id}`)?.getBoundingClientRect().top;
        if (top !== undefined && top <= CURRENT_LINE) current = id;
      }
      this.currentSection.set(current);
    };
    const onScroll = () => {
      if (!frame) frame = view.requestAnimationFrame(update);
    };
    afterNextRender(() => view.addEventListener('scroll', onScroll, { passive: true }), {
      injector: this.injector,
    });
    inject(DestroyRef).onDestroy(() => {
      view.removeEventListener('scroll', onScroll);
      if (frame) view.cancelAnimationFrame(frame);
    });
  }

  private focusFirstInvalid(): void {
    const field = firstInvalidField(this.form);
    if (!field) return;
    afterNextRender(() => this.document.getElementById(fieldId(field))?.focus(), {
      injector: this.injector,
    });
  }
}

/** Libellés des sections (titres du formulaire et liens du rail, proposition 16). */
const SECTION_LABELS: Record<SectionId, () => string> = {
  identite: () => $localize`:Section de la fiche@@patients.form.identity:Identité`,
  contexte: () => $localize`:Section de la fiche@@patients.form.context:Contexte`,
  suivi: () => $localize`:Section de la fiche@@patients.form.followUp:Suivi`,
  drapeaux: () => $localize`:Section de la fiche@@patients.form.flags:Drapeaux`,
  tags: () => $localize`:Lien du rail vers les tags@@patients.rail.tags:Tags`,
  archivage: () => $localize`:Lien du rail vers l'archivage@@patients.rail.archive:Archivage`,
};

/** Message d'une erreur sans champ : celui du serveur (déjà dans la langue), sinon générique. */
function problemText(problem: ApiProblem | null): string {
  return problem?.errors?.[0]?.message || problem?.detail || writeProblemMessage(problem?.code);
}

/**
 * Méta sous le titre (proposition 16) : « Créée le 12 nov. 2026 · 2 séances », que la page complète
 * par « · dernière modification il y a 3 j (2 versions) ». Le nombre de séances vient de la
 * projection vue d'ensemble ; tant qu'il n'est pas lu (ou s'il est illisible), la méta s'en passe.
 */
function metaText(patient: PatientView | null, sessions: number | null, locale: string): string {
  if (!patient) return '';
  const parts: string[] = [];
  if (patient.createdAt) {
    const created = formatDate(patient.createdAt, locale, 'medium');
    parts.push($localize`:Méta de la fiche@@patients.form.meta.created:Créée le ${created}:date:`);
  }
  if (sessions !== null) parts.push(sessionsLabel(sessions));
  return parts.join(' · ');
}

/**
 * « dernière modification il y a 3 j » (date relative, Intl) ; au-delà de 30 jours « dernière
 * modification le 3 oct. 2026 ». Rien tant que la fiche n'a qu'une version.
 */
function updatedLabel(patient: PatientView | null, locale: string): string {
  if (!patient?.updatedAt || patient.currentVersion <= 1) return '';
  const relative = formatRelativeDay(patient.updatedAt, locale);
  const date = formatDate(patient.updatedAt, locale, 'medium');
  return relative === date
    ? $localize`:Méta de la fiche, modification ancienne@@patients.form.meta.updatedOn:dernière modification le ${date}:date:`
    : $localize`:Méta de la fiche, modification récente@@patients.form.meta.updated:dernière modification ${relative}:when:`;
}

function sessionsLabel(count: number): string {
  if (count === 0) {
    return $localize`:Méta de la fiche, aucune séance@@patients.form.meta.noSession:aucune séance`;
  }
  return count > 1
    ? $localize`:Méta de la fiche, plusieurs séances@@patients.form.meta.sessions:${count}:count: séances`
    : $localize`:Méta de la fiche, une séance@@patients.form.meta.session:1 séance`;
}

/** « 3 versions » : lien de la méta vers l'historique. */
function versionsLabel(count: number | undefined): string {
  return (count ?? 1) > 1
    ? $localize`:Méta de la fiche, plusieurs versions@@patients.form.meta.versions:${count}:count: versions`
    : $localize`:Méta de la fiche, une version@@patients.form.meta.version:1 version`;
}

/** Nombre de valeurs renseignées (texte non vide). */
function filled(values: unknown[]): number {
  return values.filter((value) => String(value ?? '').trim() !== '').length;
}

/** « 4 champs » (Identité : seul décompte avec son unité dans la maquette). */
function fieldsCount(count: number): string {
  return count > 1
    ? $localize`:Décompte du rail, champs renseignés@@patients.rail.fields:${count}:count: champs`
    : $localize`:Décompte du rail, un champ renseigné@@patients.rail.field:1 champ`;
}

/** Fin du nom accessible après « 4 champs ». */
function filledSuffix(count: number): string {
  return count > 1
    ? $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.filled.many:renseignés`
    : $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.filled.one:renseigné`;
}

/** Fin du nom accessible après un nombre seul (« Contexte 3 champs renseignés »). */
function fieldsFilledSuffix(count: number): string {
  return count > 1
    ? $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.fieldsFilled.many:champs renseignés`
    : $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.fieldsFilled.one:champ renseigné`;
}

/** « 1 posé », « 2 posés » (drapeaux). */
function flagsCount(count: number): string {
  return count > 1
    ? $localize`:Décompte du rail, drapeaux posés@@patients.rail.flags.many:${count}:count: posés`
    : $localize`:Décompte du rail, un drapeau posé@@patients.rail.flags.one:1 posé`;
}

/** Fin du nom accessible après le nombre de tags. */
function tagsSuffix(count: number): string {
  return count > 1
    ? $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.tags.many:tags`
    : $localize`:Fin du décompte du rail, lecteurs d'écran@@patients.rail.tags.one:tag`;
}

/** Nombre de champs d'un corps de PATCH (context et followUp comptent champ par champ). */
function leafCount(patch: Record<string, unknown> | null): number {
  if (!patch) return 0;
  return Object.values(patch).reduce<number>(
    (sum, value) =>
      sum + (value !== null && typeof value === 'object' ? Object.keys(value as object).length : 1),
    0,
  );
}
