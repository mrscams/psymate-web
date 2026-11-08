import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import {
  EditableKind,
  FixedEntry,
  VocabularyCreateInput,
  VocabularyEntry,
  VocabularyPatch,
} from '../data/admin.model';
import { VocabularyStore } from '../data/vocabulary.store';
import { AddEntryFormComponent } from '../ui/add-entry-form.component';
import { DeactivateDialogComponent, DeactivateDialogData } from '../ui/deactivate-dialog.component';
import { RenamePanelComponent } from '../ui/rename-panel.component';

/** Sous-onglets de la fiche 28 : deux listes éditables, deux listes fixes en lecture seule. */
export const VOCABULARY_TABS = ['specialty', 'audience', 'modality', 'language'] as const;
export type VocabularyTab = (typeof VOCABULARY_TABS)[number];

/**
 * /admin/vocabulaire (fiche 28, G Q15) : spécialités et publics de l'annuaire (ajouter, renommer,
 * ordonner, désactiver, réactiver ; on ne supprime jamais), modalités et langues en lecture seule.
 * Sous-onglet et « désactivées » dans l'URL (?kind=audience&inactive=1). Aucune donnée patient.
 */
@Component({
  selector: 'pm-vocabulary-page',
  imports: [MatButtonModule, StateComponent, AddEntryFormComponent, RenamePanelComponent],
  providers: [VocabularyStore],
  templateUrl: './vocabulary.page.html',
  styleUrl: './vocabulary.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabularyPage {
  readonly kind = input<string>();
  readonly inactive = input<string>();

  protected readonly store = inject(VocabularyStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tabs = VOCABULARY_TABS;
  protected readonly tab = computed<VocabularyTab>(() =>
    VOCABULARY_TABS.includes(this.kind() as VocabularyTab)
      ? (this.kind() as VocabularyTab)
      : 'specialty',
  );
  protected readonly editable = computed(
    () => this.tab() === 'specialty' || this.tab() === 'audience',
  );
  protected readonly showInactive = computed(() => this.inactive() === '1');

  /** Ligne dont le panneau « Renommer » est ouvert : `kind:code`. */
  protected readonly editing = signal<string | null>(null);

  protected readonly entries = computed(() => {
    const list = this.tab() === 'audience' ? this.store.audiences() : this.store.specialties();
    return this.showInactive() ? list : list.filter((entry) => entry.active);
  });
  protected readonly fixedEntries = computed<FixedEntry[]>(() => {
    const fixed = this.store.fixed().data;
    if (!fixed) return [];
    return this.tab() === 'modality' ? fixed.modalities : fixed.languages;
  });

  protected readonly kindState = computed(() =>
    this.editable()
      ? stateKind(this.store.entries(), () => this.entries().length === 0)
      : stateKind(this.store.fixed(), () => this.fixedEntries().length === 0),
  );
  protected readonly refreshing = computed(() => isRefreshing(this.store.entries()));

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void (this.editable() ? this.store.reload() : this.store.loadFixed()),
  };

  protected readonly create = (input: VocabularyCreateInput): Promise<ApiProblem | null> =>
    this.store.create(input).then((problem) => {
      if (!problem) {
        this.toast.success(
          $localize`:Toast après ajout au vocabulaire@@admin.vocabulary.addedToast:Entrée ajoutée · visible immédiatement dans l'annuaire`,
        );
      }
      return problem;
    });

  constructor() {
    void this.store.load();
  }

  protected tabLabel(tab: VocabularyTab): string {
    switch (tab) {
      case 'audience':
        return $localize`:Sous-onglet du vocabulaire@@admin.vocabulary.tab.audience:Publics`;
      case 'modality':
        return $localize`:Sous-onglet du vocabulaire@@admin.vocabulary.tab.modality:Modalités`;
      case 'language':
        return $localize`:Sous-onglet du vocabulaire@@admin.vocabulary.tab.language:Langues`;
      default:
        return $localize`:Sous-onglet du vocabulaire@@admin.vocabulary.tab.specialty:Spécialités`;
    }
  }

  protected tabCount(tab: VocabularyTab): number | null {
    switch (tab) {
      case 'specialty':
        return this.store.entries().data ? this.store.specialties().length : null;
      case 'audience':
        return this.store.entries().data ? this.store.audiences().length : null;
      case 'modality':
        return this.store.fixed().data?.modalities.length ?? null;
      default:
        return this.store.fixed().data?.languages.length ?? null;
    }
  }

  protected isFixed(tab: VocabularyTab): boolean {
    return tab === 'modality' || tab === 'language';
  }

  protected selectTab(tab: VocabularyTab): void {
    this.editing.set(null);
    this.navigate({ kind: tab === 'specialty' ? null : tab });
  }

  /** Flèches gauche / droite, Début, Fin entre les sous-onglets (fiche 28). */
  protected onTabKey(event: KeyboardEvent): void {
    const index = VOCABULARY_TABS.indexOf(this.tab());
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % VOCABULARY_TABS.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + VOCABULARY_TABS.length) % VOCABULARY_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = VOCABULARY_TABS.length - 1;
    else return;
    event.preventDefault();
    this.selectTab(VOCABULARY_TABS[next]);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`#vocabulary-tab-${VOCABULARY_TABS[next]}`)
        ?.focus(),
    );
  }

  protected onInactive(event: Event): void {
    this.navigate({ inactive: (event.target as HTMLInputElement).checked ? '1' : null });
  }

  protected key(entry: VocabularyEntry): string {
    return `${entry.kind}:${entry.code}`;
  }

  protected panelId(entry: VocabularyEntry): string {
    return `rename-panel-${entry.kind}-${entry.code}`;
  }

  protected toggleRename(entry: VocabularyEntry): void {
    this.editing.update((current) => (current === this.key(entry) ? null : this.key(entry)));
  }

  protected saveFor(
    entry: VocabularyEntry,
  ): (patch: VocabularyPatch) => Promise<ApiProblem | null> {
    return (patch) => this.store.update(entry.kind, entry.code, patch);
  }

  protected onRenamed(): void {
    this.editing.set(null);
    this.toast.success(
      $localize`:Toast après renommage@@admin.vocabulary.renamedToast:Libellé mis à jour · visible immédiatement dans l'annuaire`,
    );
  }

  protected deactivate(entry: VocabularyEntry): void {
    this.dialog.open<DeactivateDialogComponent, DeactivateDialogData, boolean>(
      DeactivateDialogComponent,
      {
        data: { entry, submit: () => this.store.setActive(entry.kind, entry.code, false) },
        role: 'dialog',
        ariaModal: true,
        ariaLabelledBy: 'deactivate-title',
        ariaDescribedBy: 'deactivate-description',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
      },
    );
  }

  protected async reactivate(entry: VocabularyEntry): Promise<void> {
    const problem = await this.store.setActive(entry.kind, entry.code, true);
    if (!problem) {
      this.toast.success(
        $localize`:Toast après réactivation d'une entrée@@admin.vocabulary.reactivatedToast:« ${entry.labelFr}:label: » réactivée · visible immédiatement dans l'annuaire`,
      );
    }
  }

  protected kindOf(tab: VocabularyTab): EditableKind {
    return tab === 'audience' ? 'audience' : 'specialty';
  }

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
