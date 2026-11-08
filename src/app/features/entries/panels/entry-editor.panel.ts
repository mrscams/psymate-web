import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { formatDateTime } from '../../../core/i18n';
import {
  applyProblem,
  clearServerErrors,
  fieldId,
  FieldErrorsComponent,
  firstInvalidField,
} from '../../../shared/forms';
import {
  SidePanelComponent,
  SidePanelService,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { draftKey, EditorTarget, EntryEditorStore } from '../data/entry-editor.store';
import { EntryStatus, EntryView, SESSION_MODALITIES, SessionModality } from '../data/entry.model';
import { EmotionComboboxComponent } from '../ui/emotion-combobox.component';
import { buildEntryForm, EntryForm, formDraft } from '../ui/entry-form';
import { modalityLabel, saveProblemText } from '../ui/entry-labels';
import { IntensitySliderComponent } from '../ui/intensity-slider.component';
import { OccurredFieldsComponent } from '../ui/occurred-fields.component';
import { relativeAgo } from '../ui/relative-time';
import { TypeChipsComponent } from '../ui/type-chips.component';
import { VersionHistoryPanel } from './version-history.panel';

/** Horloge du bandeau de grâce. */
const TICK_MS = 30_000;
const GRACE_ID = 'pm-entry-grace';

/**
 * Éditeur d'entrée (fiche 05, B4 écran 5) : panneau 480 px ouvert par SidePanelService, création ou
 * correction d'une entrée des six types. Le formulaire réactif est l'état d'écran ; à la fermeture
 * sans enregistrement (Échap, croix, voile, Annuler), la saisie part au EntryEditorStore comme
 * brouillon et revient à la réouverture. ⏎ enregistre (Ctrl+⏎ depuis un texte multi-ligne),
 * Ctrl+S enregistre en brouillon (status draft). Un 422 s'affiche sous le champ fautif, le reste de
 * la saisie gardé ; 409 et erreurs réseau dans le bandeau d'alerte du panneau.
 */
@Component({
  selector: 'pm-entry-editor-panel',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    SidePanelComponent,
    StateComponent,
    FieldErrorsComponent,
    TypeChipsComponent,
    EmotionComboboxComponent,
    IntensitySliderComponent,
    OccurredFieldsComponent,
  ],
  templateUrl: './entry-editor.panel.html',
  styleUrl: './entry-editor.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKey($event)' },
})
export class EntryEditorPanel {
  protected readonly store = inject(EntryEditorStore);
  private readonly target = inject<EditorTarget>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<EntryView>>(DialogRef);
  private readonly panels = inject(SidePanelService);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly fid = fieldId;
  protected readonly typeLabelGroup = $localize`:Nom du groupe des types d'entrée@@entries.type.group:Type d'entrée`;
  protected readonly modalities = SESSION_MODALITIES;
  protected readonly editing = !!this.target.entryId;
  private readonly key = draftKey(this.target);

  /** Formulaire : tout de suite en création, à l'arrivée de l'entrée en correction. */
  protected readonly form = signal<EntryForm | null>(null);
  /** Change à chaque saisie : les computed qui lisent la valeur du formulaire s'y abonnent. */
  private readonly revision = signal(0);
  private subscription: Subscription | null = null;
  private saved = false;

  protected readonly type = computed(() => {
    this.revision();
    return this.form()?.controls.type.value ?? this.target.type ?? 'note';
  });

  protected readonly title = computed(() => {
    const entry = this.store.entry().data;
    if (!this.editing) {
      return $localize`:Titre du panneau en création@@entries.editor.titleNew:Nouvelle entrée`;
    }
    const version = entry?.version ?? 1;
    return $localize`:Titre du panneau en correction@@entries.editor.titleEdit:Modifier l'entrée · v${version}:version:`;
  });

  /** Correction : chargement ou erreur de l'entrée (pm-state). */
  protected readonly entryState = computed(() =>
    this.editing ? stateKind(this.store.entry()) : null,
  );
  protected readonly entryRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryEntry(),
  };
  protected readonly entryErrorTitle = $localize`:Entrée illisible@@entries.editor.loadError:Impossible de charger cette entrée`;

  protected readonly grace = this.store.grace;

  /** Ctrl+S / Brouillon : à la création (sauf séance), ou pour corriger une entrée encore brouillon. */
  protected readonly draftAllowed = computed(() =>
    this.editing ? this.store.entry().data?.status === 'draft' : this.type() !== 'session',
  );
  protected readonly graceId = GRACE_ID;

  protected readonly graceText = computed(() => {
    const grace = this.grace();
    if (!grace) return '';
    const now = new Date(this.store.now() || Date.now());
    const ago = relativeAgo(grace.lastChangedAt, this.locale, now);
    if (grace.inGrace) {
      return $localize`:Bandeau de grâce, dans la fenêtre@@entries.grace.in:Créée ${ago}:ago: · dans la fenêtre de grâce (1 h 15) : la version 1 sera modifiée en place, sans nouvelle version.`;
    }
    const next = grace.nextVersion;
    return $localize`:Bandeau de grâce, hors fenêtre@@entries.grace.out:Modifiée ${ago}:ago: · hors fenêtre de grâce (1 h 15) : cette correction créera la version ${next}:next:.`;
  });

  protected readonly saveLabel = computed(() => {
    const grace = this.grace();
    if (grace && !grace.inGrace) {
      const next = grace.nextVersion;
      return $localize`:Bouton d'enregistrement d'une correction@@entries.editor.saveVersion:Enregistrer la version ${next}:next:`;
    }
    return $localize`:Bouton d'enregistrement@@entries.editor.save:Enregistrer`;
  });

  protected readonly historyLabel = computed(() => {
    const count = this.store.versionCount();
    const current = this.store.entry().data?.version ?? count;
    return $localize`:Lien vers l'historique des versions@@entries.editor.history:Version ${current}:current: · Historique (${count}:count: versions)`;
  });

  /** Alerte du panneau : 409, réseau, 5xx, ou erreurs de champ sans contrôle (tags[i]…). */
  protected readonly alert = signal<string | null>(null);

  protected readonly sessionOptions = computed(() =>
    this.store.sessionOptions().map((option) => ({
      id: option.id,
      label: this.sessionLabel(option.startedAt, option.open),
    })),
  );
  protected readonly hasCurrentSession = computed(() => this.store.currentSession() !== null);
  /** Bloc Séance : chargement (le select attend) ou erreur ; « vide » = « Aucune séance » dans le select. */
  protected readonly sessionsLoading = computed(() => {
    const status = this.store.sessions().status;
    return (status === 'loading' || status === 'idle') && !this.store.sessions().data;
  });
  protected readonly sessionsState = computed(() => {
    if (this.sessionsLoading()) return 'loading' as const;
    return this.store.sessions().status === 'error' ? ('error' as const) : null;
  });
  protected readonly sessionsRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retrySessions(),
  };
  protected readonly sessionsErrorTitle = $localize`:Séances illisibles@@entries.session.loadError:Impossible de charger les séances`;

  protected readonly tagsState = computed(() => stateKind(this.store.tags()));
  protected readonly tagsRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryTags(),
  };
  protected readonly tagsErrorTitle = $localize`:Tags illisibles@@entries.tags.loadError:Impossible de charger les tags`;
  protected readonly tagsEmptyTitle = $localize`:Aucun tag@@entries.tags.emptyTitle:Aucun tag pour le moment`;
  protected readonly tagsEmptyMessage = $localize`:Aucun tag, où en créer@@entries.tags.emptyMessage:Les tags se créent dans Compte, Tags.`;

  protected readonly selectedTags = computed(() => {
    this.revision();
    return this.form()?.controls.tags.value ?? [];
  });

  constructor() {
    void this.store.open(this.target);

    // Création : le brouillon (ou un brouillon vide) est prêt dès l'ouverture.
    if (!this.editing) this.useDraft();

    // Correction : le formulaire naît avec l'entrée lue ; le type est verrouillé.
    effect(() => {
      const entry = this.store.entry().data;
      if (!this.editing || !entry || untracked(this.form)) return;
      untracked(() => {
        this.useDraft();
        this.form()?.controls.type.disable({ emitEvent: false });
        afterNextRender(() => this.focusFirst(), { injector: this.injector });
      });
    });

    // Séance courante présélectionnée (sessions/current), tant qu'on n'en a pas choisi une autre.
    effect(() => {
      const current = this.store.currentSession();
      const form = untracked(this.form);
      if (!current || !form || this.editing) return;
      const control = form.controls.sessionId;
      if (!control.value && control.pristine) control.setValue(current.id);
    });

    // Le bandeau de grâce décrit le dialogue (fiche 05, accessibilité).
    effect(() => {
      const described = !!this.grace();
      afterNextRender(
        () => {
          const dialog = this.host.nativeElement.closest('[role="dialog"]');
          if (!dialog) return;
          if (described) dialog.setAttribute('aria-describedby', GRACE_ID);
          else if (dialog.getAttribute('aria-describedby') === GRACE_ID)
            dialog.removeAttribute('aria-describedby');
        },
        { injector: this.injector },
      );
    });

    const timer = setInterval(() => this.store.tick(), TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.subscription?.unsubscribe();
      const form = this.form();
      if (!this.saved && form) this.store.keepDraft(this.key, formDraft(form));
      this.store.closed(this.key);
    });
  }

  protected modalityName(modality: SessionModality): string {
    return modalityLabel(modality);
  }

  protected invalid(path: string): boolean {
    const control = this.form()?.get(path);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected toggleTag(label: string, checked: boolean): void {
    const control = this.form()?.controls.tags;
    if (!control) return;
    const rest = control.value.filter((tag) => tag !== label);
    control.setValue(checked ? [...rest, label] : rest);
    control.markAsDirty();
  }

  protected openHistory(): void {
    this.panels.open(VersionHistoryPanel, { width: 420, stack: true });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  /**
   * ⏎ enregistre, sauf dans un texte multi-ligne (Ctrl+⏎), sur un bouton ou un lien (activation
   * native) et dans la liste des émotions ouverte (elle choisit) ; Ctrl+S enregistre en brouillon.
   */
  protected onKey(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (this.draftAllowed()) void this.submit('draft');
      return;
    }
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (!ctrl && target) {
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
      if (target.closest('fieldset.create')) return;
    }
    event.preventDefault();
    void this.submit('final');
  }

  protected async submit(status: EntryStatus = 'final'): Promise<void> {
    const form = this.form();
    if (!form || this.store.saving()) return;
    clearServerErrors(form);
    this.alert.set(null);
    const saved = await this.store.save(formDraft(form), status);
    if (saved) {
      this.saved = true;
      this.toast.success(this.savedText(saved, status));
      this.dialogRef.close(saved);
      return;
    }
    const problem = this.store.problem();
    if (!problem) return;
    const { unmatched } = applyProblem(form, problem);
    if (problem.errors?.length) {
      if (unmatched.length > 0) this.alert.set(unmatched.map((error) => error.message).join(' '));
    } else {
      this.alert.set(saveProblemText(problem.code, problem.status));
    }
    this.focusInvalid(form);
  }

  private savedText(saved: EntryView, status: EntryStatus): string {
    if (this.editing && status === 'draft') {
      return $localize`:Toast après un brouillon@@entries.saved.draft:Brouillon enregistré.`;
    }
    if (this.editing) {
      const version = saved.version;
      return $localize`:Toast après une correction@@entries.saved.edit:Correction enregistrée (version ${version}:version:).`;
    }
    return status === 'draft'
      ? $localize`:Toast après un brouillon@@entries.saved.draft:Brouillon enregistré.`
      : $localize`:Toast après une création@@entries.saved.create:Entrée enregistrée.`;
  }

  private sessionLabel(startedAt: string, open: boolean): string {
    const date = formatDateTime(startedAt, this.locale);
    return open
      ? $localize`:Séance ouverte dans le bloc Séance@@entries.session.open:Séance du ${date}:date: (en cours)`
      : $localize`:Séance dans le bloc Séance@@entries.session.option:Séance du ${date}:date:`;
  }

  /** Construit le formulaire depuis le brouillon de la cible et suit ses changements. */
  private useDraft(): void {
    const draft = this.store.currentDraft();
    if (!draft) return;
    const form = buildEntryForm(draft);
    this.subscription?.unsubscribe();
    this.subscription = form.valueChanges.subscribe(() => this.revision.update((n) => n + 1));
    this.form.set(form);
  }

  private focusFirst(): void {
    const body = this.host.nativeElement.querySelector('.panel-body');
    body
      ?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, [role="slider"]')
      ?.focus();
  }

  private focusInvalid(form: EntryForm): void {
    afterNextRender(
      () => {
        const field = firstInvalidField(form);
        const element = field ? this.host.nativeElement.querySelector(`#${fieldId(field)}`) : null;
        if (element instanceof HTMLElement) element.focus();
        else this.host.nativeElement.querySelector<HTMLElement>('.alert')?.focus();
      },
      { injector: this.injector },
    );
  }
}
