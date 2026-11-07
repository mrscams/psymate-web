import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { formatDate, subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import { ApiProblem, FieldProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import {
  applyProblem,
  fieldId,
  FieldErrorsComponent,
  firstInvalidField,
  ProblemSummaryComponent,
} from '../../../shared/forms';
import {
  ConfirmDialogService,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { PatientListStore } from '../data/patient-list.store';
import {
  diffPatient,
  emptyForm,
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
import { FlagFieldsComponent } from '../ui/flag-fields.component';
import { HeaderPreviewComponent } from '../ui/header-preview.component';
import { buildPatientForm, toFormProblem } from '../ui/patient-form';
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
import { TagEditorComponent } from '../ui/tag-editor.component';
import { VersionHistoryComponent } from '../ui/version-history.component';

/**
 * /patients/nouveau et /patients/:id/fiche (fiche 16) : un seul formulaire pour créer et
 * modifier. Validation à la soumission ; un 422 se lit sous les champs (applyProblem) et le focus
 * va au premier champ fautif. Ctrl/Cmd+Entrée enregistre. Archivage avec le nom à retaper, puis
 * retour à la liste avec le toast « Restaurer ». Historique des versions champ par champ.
 */
@Component({
  selector: 'pm-patient-form-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    RouterLink,
    FieldErrorsComponent,
    ProblemSummaryComponent,
    StateComponent,
    FlagFieldsComponent,
    HeaderPreviewComponent,
    TagEditorComponent,
    VersionHistoryComponent,
  ],
  providers: [PatientStore],
  templateUrl: './patient-form.page.html',
  styleUrl: './patient-form.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientFormPage {
  /** Paramètre de route :id ; absent sur /patients/nouveau. */
  readonly id = input<string>();

  protected readonly store = inject(PatientStore);
  private readonly list = inject(PatientListStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly vocabulary = inject(SubjectVocabulary);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);

  protected readonly form = buildPatientForm(
    inject(NonNullableFormBuilder),
    emptyForm(inject(PreferencesStore).defaultDurationMin()),
  );
  protected readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly tags = signal<string[]>([]);
  protected readonly tagDraft = signal('');
  /** Erreurs d'un 422 sans champ du formulaire (tags[i]…), et message d'une autre erreur. */
  protected readonly unmatched = signal<FieldProblem[]>([]);
  protected readonly message = signal<string | null>(null);

  protected readonly fid = fieldId;
  protected readonly pronouns = PRONOUNS.map((value) => ({ value, label: pronounLabel(value) }));
  protected readonly rhythms = RHYTHMS.map((value) => ({ value, label: rhythmLabel(value) }));
  protected readonly modalities = MODALITIES.map((value) => ({
    value,
    label: modalityLabel(value),
  }));
  protected readonly labels = Object.fromEntries(
    ['displayName', 'birthDate', 'firstName', 'lastName', 'pronoun', 'flags.watchReason'].map(
      (field) => [field, fieldLabel(field)],
    ),
  );

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
      return $localize`:Titre de la fiche en modification@@patients.form.editTitle:Modifier la fiche · ${patient.displayName}:name:`;
    }
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return $localize`:Titre de la fiche en création@@patients.form.newTitle:Nouveau ${subject}:subject:`;
  });
  protected readonly subjects = computed(() => subjectLabel(this.vocabulary.label(), 'Many'));
  protected readonly meta = computed(() => metaText(this.patient(), this.locale));
  protected readonly previewFlags = computed(() =>
    formFlags(this.value().flags as PatientFormValue['flags']).map((flag) => ({
      kind: flag.kind,
      reason: flag.reason ?? null,
      setAt: this.patient()?.flags.find((f) => f.kind === flag.kind)?.setAt ?? null,
    })),
  );
  protected readonly tagMessage = computed(() => {
    const problem = this.store.tagProblem();
    return problem ? problemText(problem) : null;
  });
  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.load(),
  };
  protected readonly loadErrorTitle = $localize`:État erreur de la fiche@@patients.form.loadError:Impossible de charger cette fiche`;

  constructor() {
    void this.store.loadTags();
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
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

  /** Ctrl/Cmd+Entrée enregistre depuis n'importe quel champ (fiche 16). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.submit();
    }
  }

  protected async submit(): Promise<void> {
    if (this.store.busy() || this.readOnly()) return;
    this.message.set(null);
    this.unmatched.set([]);
    this.form.controls.flags.controls.watchReason.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const value = this.form.getRawValue();
    const patient = this.patient();
    if (!patient) {
      const created = await this.store.create(toCreateInput(value, this.tags()));
      if (created) {
        await this.router.navigate(['/patients', created.id, 'overview']);
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

  protected cancel(): void {
    const patient = this.patient();
    void this.router.navigate(patient ? ['/patients', patient.id, 'overview'] : ['/patients']);
  }

  protected async addTag(label: string): Promise<void> {
    const tag = await this.store.resolveTag(label);
    if (!tag) return;
    if (!this.tags().includes(tag.label)) this.tags.update((tags) => [...tags, tag.label]);
    this.tagDraft.set('');
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
      const { unmatched } = applyProblem(this.form, toFormProblem(problem));
      this.unmatched.set(unmatched);
      this.focusFirstInvalid();
      return;
    }
    if (problem.code === 'FLAG_ALREADY_ACTIVE') void this.load();
    this.message.set(
      problem.status === 422 ? problemText(problem) : writeProblemMessage(problem.code),
    );
  }

  private focusFirstInvalid(): void {
    const field = firstInvalidField(this.form);
    if (!field) return;
    afterNextRender(() => this.document.getElementById(fieldId(field))?.focus(), {
      injector: this.injector,
    });
  }
}

/** Message d'une erreur sans champ : celui du serveur (déjà dans la langue), sinon générique. */
function problemText(problem: ApiProblem | null): string {
  return problem?.errors?.[0]?.message || problem?.detail || writeProblemMessage(problem?.code);
}

function metaText(patient: PatientView | null, locale: string): string {
  if (!patient) return '';
  const parts: string[] = [];
  if (patient.createdAt) {
    const created = formatDate(patient.createdAt, locale, 'medium');
    parts.push($localize`:Méta de la fiche@@patients.form.meta.created:créée le ${created}:date:`);
  }
  const count = patient.currentVersion;
  parts.push(
    count > 1
      ? $localize`:Méta de la fiche, plusieurs versions@@patients.form.meta.versions:${count}:count: versions`
      : $localize`:Méta de la fiche, une version@@patients.form.meta.version:1 version`,
  );
  if (patient.updatedAt && patient.currentVersion > 1) {
    const updated = formatDate(patient.updatedAt, locale, 'medium');
    parts.push(
      $localize`:Méta de la fiche@@patients.form.meta.updated:dernière modification le ${updated}:date:`,
    );
  }
  return parts.join(' · ');
}
