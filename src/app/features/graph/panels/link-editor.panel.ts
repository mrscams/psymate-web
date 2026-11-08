import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
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
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, merge } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import {
  applyProblem,
  clearServerErrors,
  fieldId,
  FieldErrorsComponent,
} from '../../../shared/forms';
import {
  ConfirmDialogService,
  ENTRY_TYPES,
  EntryIconComponent,
  EntryType,
  entryTypeLabel,
  SidePanelComponent,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { formatOccurred, stateKind } from '../../../shared/util';
import { LinkEditorStore } from '../data/link-editor.store';
import {
  EntryLink,
  entryName,
  LinkEntry,
  LinkTypeCode,
  orient,
  otherEnd,
  RATIONALE_MAX,
  typeAvailability,
  TypeAvailability,
} from '../data/link.model';
import { saveProblemText, shapeText } from '../ui/link-labels';
import { LinkTypeChipsComponent } from '../ui/link-type-chips.component';
import { PlacedLinksComponent } from '../ui/placed-links.component';

/** Données d'ouverture du panneau (openLinkEditor). */
export interface LinkEditorData {
  entryId: string;
  patientName: string | null;
}

/** Délai sans frappe avant de relancer la recherche de cible (B3 flux 5 : 300 ms). */
const SEARCH_DEBOUNCE_MS = 300;
/** Durée du toast « Lien enregistré · Annuler » (fiche 06 : 10 s). */
const UNDO_MS = 10_000;

type LinkForm = FormGroup<{
  targetId: FormControl<string>;
  linkType: FormControl<LinkTypeCode | null>;
  rationale: FormControl<string>;
}>;

/**
 * Éditeur de lien (fiche 06, B3 flux 4, B4 écran 6) : panneau 420 px ouvert par openLinkEditor,
 * empilé sur l'éditeur d'entrée s'il est ouvert. L'entrée ouverte est la source proposée ; la cible
 * se cherche dans le dossier (GET /api/patients/{id}/search, une page) ; les entrées déjà liées
 * sont grisées avec le verbe du lien ; les puces des types suivent la matrice E5.3 pour le couple
 * (types refusés désactivés, avec leur aide) ; « Inverser le sens » échange les deux extrémités et
 * la phrase lisible (`aria-live`) se recompose. ⏎ enregistre (Ctrl+⏎ depuis la justification).
 * Échap ou le voile ferment tout de suite si rien n'est choisi, après confirmation sinon. 409
 * LINK_EXISTS : « Ce lien existe déjà · Modifier le type ? » ouvre la modification du lien existant.
 */
@Component({
  selector: 'pm-link-editor-panel',
  imports: [
    ReactiveFormsModule,
    SidePanelComponent,
    StateComponent,
    FieldErrorsComponent,
    EntryIconComponent,
    LinkTypeChipsComponent,
    PlacedLinksComponent,
  ],
  templateUrl: './link-editor.panel.html',
  styleUrl: './link-editor.panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'onKey($event)' },
})
export class LinkEditorPanel {
  protected readonly store = inject(LinkEditorStore);
  protected readonly data = inject<LinkEditorData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<EntryLink>>(DialogRef);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly shortcuts = inject(ShortcutService);
  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly fid = fieldId;
  protected readonly rationaleMax = RATIONALE_MAX;
  protected readonly entryTypes = ENTRY_TYPES;
  protected readonly title = $localize`:Titre de l'éditeur de lien@@links.editor.title:Lier deux entrées`;
  protected readonly relationLabel = $localize`:Nom du groupe des types de lien@@links.editor.relation:Relation`;
  private readonly unnamed = $localize`:Nom d'une entrée sans titre ni texte@@links.editor.unnamed:une entrée`;

  protected readonly form: LinkForm = new FormGroup({
    targetId: new FormControl('', { nonNullable: true }),
    linkType: new FormControl<LinkTypeCode | null>(null),
    rationale: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(RATIONALE_MAX)],
    }),
  });
  protected readonly search = new FormControl(this.store.query().q, { nonNullable: true });
  protected readonly typeFilter = new FormControl<EntryType | ''>(this.store.query().type ?? '', {
    nonNullable: true,
  });

  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  /** Sens inversé : la cible devient la source (direction incoming). */
  protected readonly reversed = signal(false);
  /** Cible choisie, gardée même si une nouvelle recherche ne la montre plus. */
  protected readonly target = signal<LinkEntry | null>(null);
  /** Alerte du panneau : 409, réseau, erreurs de champ sans contrôle. */
  protected readonly alert = signal<string | null>(null);
  /** 409 LINK_EXISTS : identifiant du lien existant, pour « Modifier le type ». */
  protected readonly existingLinkId = signal<string | null>(null);
  /** Lien de la liste en cours de modification de type. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editTypes = signal<{ from: EntryType; to: EntryType } | null>(null);
  /** Le type de l'autre extrémité du lien en modification n'a pas pu être lu. */
  protected readonly editError = signal(false);
  private confirming = false;

  protected readonly source = computed(() => this.store.source().data);
  protected readonly sourceState = computed(() => stateKind(this.store.source()));
  /** 403 et 404 sont définitifs : pas de « Réessayer » (comme le shell). */
  protected readonly sourceRetryable = computed(() => {
    const status = this.store.source().problem?.status ?? 0;
    return status === 0 || status >= 500 || status === 429;
  });
  protected readonly sourceRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retrySource(),
  };
  protected readonly sourceErrorTitle = $localize`:Entrée source illisible@@links.source.error:Impossible de charger cette entrée`;

  protected readonly catalogState = computed(() => stateKind(this.store.catalog()));
  protected readonly catalogRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryCatalog(),
  };
  protected readonly catalogErrorTitle = $localize`:Types de liens illisibles@@links.catalog.error:Impossible de charger les types de liens`;

  /**
   * Une recherche relancée qui échoue le dit (même si l'ancienne liste existe) ; une recherche vide
   * garde la cible déjà choisie visible.
   */
  protected readonly targetsState = computed(() => {
    const targets = this.store.targets();
    if (targets.status === 'error') return 'error' as const;
    const kind = stateKind(targets);
    return kind === 'empty' && this.target() ? null : kind;
  });
  protected readonly targetsRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryTargets(),
  };
  protected readonly targetsErrorTitle = $localize`:Recherche de cible en erreur@@links.targets.error:Impossible de chercher dans le dossier`;
  protected readonly targetsEmptyTitle = $localize`:Aucune cible trouvée@@links.targets.empty:Aucune autre entrée trouvée`;
  protected readonly targetsEmptyMessage = $localize`:Aucune cible, que faire@@links.targets.emptyMessage:Modifiez la recherche ou le type.`;

  /** Vide seulement s'il n'y a ni lien actif ni lien retiré pendant cette ouverture. */
  protected readonly linksState = computed(() => {
    const kind = stateKind(this.store.links());
    return kind === 'empty' && this.store.removed().length > 0 ? null : kind;
  });
  protected readonly linksRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryLinks(),
  };
  protected readonly linksErrorTitle = $localize`:Liens illisibles@@links.placed.error:Impossible de charger les liens de cette entrée`;
  protected readonly linksEmptyTitle = $localize`:Aucun lien posé@@links.placed.empty:Aucun lien sur cette entrée pour le moment`;

  protected readonly linksHeading = computed(() => {
    const count = this.store.activeCount();
    return $localize`:Titre de la liste des liens posés@@links.placed.title:Liens déjà posés sur cette entrée · ${count}:count:`;
  });

  /** Cibles proposées : la cible choisie reste en tête si la recherche ne la rend plus. */
  protected readonly candidates = computed(() => {
    const found = this.store.targets().data ?? [];
    const chosen = this.target();
    const list =
      chosen && !found.some((entry) => entry.id === chosen.id) ? [chosen, ...found] : found;
    const linked = this.store.linkedTo();
    return list.map((entry) => {
      const labels = linked.get(entry.id) ?? [];
      return {
        entry,
        name: entryName(entry, this.unnamed),
        typeLabel: entryTypeLabel(entry.type),
        when: this.when(entry),
        linked: labels.length > 0,
        linkedText: labels.length
          ? $localize`:Mention d'une entrée déjà liée@@links.targets.linked:déjà lié (${labels.join(', ')}:labels:)`
          : '',
      };
    });
  });

  protected readonly sourceView = computed(() => {
    const source = this.source();
    if (!source) return null;
    return {
      ...source,
      name: entryName(source, this.unnamed),
      typeLabel: entryTypeLabel(source.type),
      when: this.when(source),
    };
  });

  /** Les deux extrémités dans l'ordre de la phrase et du lien. */
  private readonly ends = computed(() => {
    const source = this.source();
    if (!source) return null;
    return orient<LinkEntry | null>(source, this.target(), this.reversed());
  });

  /** Puces : chaque type du catalogue, permis ou non pour (type de la source, type de la cible). */
  protected readonly availability = computed<TypeAvailability[]>(() => {
    const ends = this.ends();
    const types = this.store.catalog().data ?? [];
    if (!ends) return typeAvailability(types, null, null);
    return typeAvailability(types, ends.from?.type ?? null, ends.to?.type ?? null);
  });

  protected readonly selectedType = computed(() => {
    const code = this.value().linkType ?? null;
    return this.store.catalog().data?.find((type) => type.code === code) ?? null;
  });

  /** La phrase « <source> <verbe> <cible> », recomposée à chaque choix. */
  protected readonly sentence = computed(() => {
    const ends = this.ends();
    if (!ends) return null;
    const pending = '…';
    return {
      from: ends.from ? entryName(ends.from, this.unnamed) : pending,
      verb: this.selectedType()?.label ?? pending,
      to: ends.to ? entryName(ends.to, this.unnamed) : pending,
    };
  });

  protected readonly shape = computed(() => {
    const type = this.selectedType();
    return type ? shapeText(type) : '';
  });

  protected readonly ready = computed(
    () =>
      !!this.source() &&
      !!this.value().targetId &&
      !!this.value().linkType &&
      this.availability().some((item) => item.allowed && item.type.code === this.value().linkType),
  );

  /** Un choix est fait : Échap et le voile demandent confirmation. */
  private readonly dirty = computed(() => !!this.value().targetId || !!this.value().linkType);

  /** Puces du lien en modification : types permis pour le couple (source, cible) de ce lien. */
  protected readonly editAvailability = computed<TypeAvailability[] | null>(() => {
    const ends = this.editTypes();
    if (!ends) return null;
    return typeAvailability(this.store.catalog().data ?? [], ends.from, ends.to);
  });

  constructor() {
    void this.store.open(this.data.entryId);

    // Recherche : 300 ms sans frappe ; le type relance tout de suite.
    const query$ = merge(
      this.search.valueChanges.pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
      this.typeFilter.valueChanges,
    ).pipe(
      map(() => ({ q: this.search.value, type: this.typeFilter.value || null })),
      distinctUntilChanged((a, b) => a.q === b.q && a.type === b.type),
    );
    const subscription = query$.subscribe((query) => void this.store.searchTargets(query));

    // Un type devenu interdit (autre cible, sens inversé) est retiré.
    effect(() => {
      const code = this.value().linkType;
      if (!code) return;
      const item = this.availability().find((entry) => entry.type.code === code);
      if (this.store.catalog().data && item && !item.allowed) {
        this.form.controls.linkType.setValue(null);
      }
    });

    // Échap et le voile : fermeture immédiate sans choix, confirmation sinon.
    effect(() => {
      this.dialogRef.disableClose = this.dirty();
    });
    const backdrop = this.dialogRef.backdropClick.subscribe(() => {
      if (this.dirty()) void this.requestClose();
    });

    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      backdrop.unsubscribe();
      this.store.closed(this.data.entryId);
    });
  }

  protected chooseTarget(entry: LinkEntry): void {
    this.target.set(entry);
    this.form.controls.targetId.setValue(entry.id);
    this.form.controls.targetId.markAsDirty();
    this.resetProblem();
  }

  protected chooseType(code: LinkTypeCode): void {
    this.form.controls.linkType.setValue(code);
    this.form.controls.linkType.markAsDirty();
    this.resetProblem();
  }

  protected invert(): void {
    this.reversed.update((value) => !value);
    this.resetProblem();
  }

  /** Annuler, Échap, voile : confirmation si une cible ou un type est choisi. */
  protected async requestClose(): Promise<void> {
    if (!this.dirty()) {
      this.dialogRef.close();
      return;
    }
    if (this.confirming) return;
    this.confirming = true;
    this.shortcuts.enabled.set(false);
    const leave = await this.confirmDialog.confirm({
      title: $localize`:Confirmation de fermeture de l'éditeur de lien@@links.leave.title:Abandonner ce lien ?`,
      description: $localize`:Détail de la confirmation de fermeture@@links.leave.description:La cible et le type choisis ne seront pas enregistrés.`,
      confirmLabel: $localize`:Bouton qui abandonne le lien@@links.leave.confirm:Abandonner`,
      cancelLabel: $localize`:Bouton qui revient à l'éditeur de lien@@links.leave.cancel:Continuer`,
    });
    this.shortcuts.enabled.set(true);
    this.confirming = false;
    if (leave) this.dialogRef.close();
  }

  /**
   * ⏎ enregistre (depuis la recherche ou une cible aussi), sauf dans la justification (Ctrl+⏎), sur
   * un bouton, un lien ou une liste déroulante (activation native) ; Échap passe par requestClose
   * quand un choix est fait.
   */
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.dirty() || event.defaultPrevented) return;
      event.preventDefault();
      void this.requestClose();
      return;
    }
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.shiftKey || event.altKey) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const target = event.target as HTMLElement | null;
    if (!ctrl && target) {
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') return;
    }
    event.preventDefault();
    void this.submit(false);
  }

  /** Enregistre le lien ; `another` : le panneau reste ouvert pour lier une autre entrée. */
  protected async submit(another: boolean): Promise<void> {
    if (this.store.saving()) return;
    clearServerErrors(this.form);
    this.alert.set(null);
    this.existingLinkId.set(null);
    const value = this.form.getRawValue();
    if (!this.ready() || !value.linkType) {
      this.alert.set(
        $localize`:Lien incomplet@@links.editor.incomplete:Choisissez une cible et un type de lien permis.`,
      );
      this.focusAlert();
      return;
    }
    if (this.form.controls.rationale.invalid) {
      this.form.controls.rationale.markAsTouched();
      return;
    }
    const link = await this.store.createLink({
      targetId: value.targetId,
      linkType: value.linkType,
      reversed: this.reversed(),
      rationale: value.rationale,
    });
    if (link) {
      this.toast.show({
        level: 'success',
        message: $localize`:Toast après la pose d'un lien@@links.saved:Lien enregistré.`,
        durationMs: UNDO_MS,
        action: {
          label: $localize`:Action du toast qui retire le lien posé@@links.saved.undo:Annuler`,
          handler: () => void this.undo(link),
        },
      });
      if (another) this.restart();
      else this.dialogRef.close(link);
      return;
    }
    const problem = this.store.problem();
    if (!problem) return;
    const { unmatched } = applyProblem(this.form, problem);
    if (problem.code === 'LINK_EXISTS') {
      const existing = problem.extra?.['existingLinkId'];
      this.existingLinkId.set(typeof existing === 'string' ? existing : null);
      this.alert.set(saveProblemText(problem));
    } else if (problem.errors?.length) {
      if (unmatched.length > 0) this.alert.set(unmatched.map((error) => error.message).join(' '));
    } else {
      this.alert.set(saveProblemText(problem));
    }
    this.focusAlert();
  }

  /** 409 LINK_EXISTS → « Modifier le type » : ouvre la modification du lien existant dans la liste. */
  protected async editExisting(): Promise<void> {
    const linkId = this.existingLinkId();
    if (!linkId) return;
    if (!this.store.links().data?.some((link) => link.id === linkId)) await this.store.retryLinks();
    await this.startEdit(linkId);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-link-id="${linkId}"] [aria-pressed="true"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected async startEdit(linkId: string): Promise<void> {
    const link = this.store.links().data?.find((item) => item.id === linkId);
    const source = this.source();
    if (!link || !source) return;
    this.editingId.set(linkId);
    this.editTypes.set(null);
    this.editError.set(false);
    const other = otherEnd(link, source.id);
    const otherType = await this.store.resolveEntryType(other);
    if (this.editingId() !== linkId) return;
    if (!otherType) {
      this.editError.set(true);
      return;
    }
    this.editTypes.set(
      link.sourceId === source.id
        ? { from: source.type, to: otherType }
        : { from: otherType, to: source.type },
    );
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editTypes.set(null);
    this.editError.set(false);
  }

  protected async changeType(change: { linkId: string; linkType: LinkTypeCode }): Promise<void> {
    if (await this.store.changeLinkType(change.linkId, change.linkType)) {
      this.cancelEdit();
      this.alert.set(null);
      this.existingLinkId.set(null);
      this.toast.success(
        $localize`:Toast après un changement de type de lien@@links.changed:Type du lien modifié.`,
      );
    }
  }

  protected async remove(linkId: string): Promise<void> {
    if (this.editingId() === linkId) this.cancelEdit();
    if (await this.store.removeLink(linkId)) {
      this.toast.success($localize`:Toast après le retrait d'un lien@@links.removed:Lien retiré.`);
    }
  }

  protected rationaleCount(): string {
    const length = this.value().rationale?.length ?? 0;
    return `${length} / ${RATIONALE_MAX}`;
  }

  protected typeName(type: EntryType): string {
    return entryTypeLabel(type);
  }

  protected invalid(name: 'targetId' | 'linkType' | 'rationale'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  private async undo(link: EntryLink): Promise<void> {
    if (await this.store.undoLink(link)) {
      this.toast.info($localize`:Toast après l'annulation d'un lien@@links.undone:Lien annulé.`);
    }
  }

  /** « Enregistrer et lier une autre » : même source, cible, type et justification effacés. */
  private restart(): void {
    this.form.reset({ targetId: '', linkType: null, rationale: '' });
    this.target.set(null);
    this.reversed.set(false);
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
      { injector: this.injector },
    );
  }

  private resetProblem(): void {
    if (this.store.problem()) this.store.clearProblem();
    this.alert.set(null);
    this.existingLinkId.set(null);
    clearServerErrors(this.form);
  }

  private when(entry: LinkEntry): string {
    if (!entry.occurredFrom) return '';
    return formatOccurred(
      { from: entry.occurredFrom, to: entry.occurredTo, precision: entry.precision },
      this.locale,
    );
  }

  private focusAlert(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.alert')?.focus(), {
      injector: this.injector,
    });
  }
}
