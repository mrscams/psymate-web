import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import {
  ACCOUNT_PATHS,
  AccountNavComponent,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { TagsStore } from '../data/tags.store';
import { CreateTagFn, TagFormComponent } from '../ui/vocabulary/tag-form.component';
import { MergeTagFn, RenameTagFn, TagTableComponent } from '../ui/vocabulary/tag-table.component';
import { professionLabel } from './preferences.page';

/**
 * /mon-compte/tags (C2 M1-09) : liste des tags du praticien, ajout, renommage, fusion avec aperçu.
 * Un libellé d'émotion est refusé (422 TAG_IS_EMOTION) avec l'émotion proposée. Après une fusion,
 * la réétiquette des patients et des entrées est asynchrone côté API (G Q42).
 */
@Component({
  selector: 'pm-tags-page',
  imports: [RouterLink, AccountNavComponent, StateComponent, TagFormComponent, TagTableComponent],
  providers: [TagsStore],
  templateUrl: './tags.page.html',
  styleUrl: './vocabulary.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagsPage {
  protected readonly store = inject(TagsStore);
  protected readonly session = inject(SessionStore);
  private readonly toasts = inject(ToastService);

  protected readonly emotionsPath = ACCOUNT_PATHS.emotions;
  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );

  protected readonly listState = computed(() => stateKind(this.store.tags()));

  /** Titre de l'état erreur (la phrase reste celle de pm-state). */
  protected readonly errorTitle = $localize`:Titre de l'état erreur des tags@@vocabulary.tags.errorTitle:Impossible de charger vos tags`;
  /** Textes de l'état vide. */
  protected readonly empty = {
    title: $localize`:Titre de l'état vide des tags@@vocabulary.tags.emptyTitle:Aucun tag`,
    message: $localize`:Message de l'état vide des tags@@vocabulary.tags.emptyMessage:Créez-en un ci-dessus, ou depuis la fiche d'un patient.`,
  };

  protected readonly retry = {
    label: $localize`:Bouton Réessayer de la liste des tags@@vocabulary.tags.retry:Réessayer`,
    handler: (): void => void this.store.load(),
  };

  constructor() {
    void this.store.load();
  }

  protected readonly create: CreateTagFn = async (label) => {
    const created = await this.store.createTag(label);
    if (!created) return this.store.createProblem();
    this.toasts.success(
      $localize`:Toast après la création d'un tag@@vocabulary.tags.add.done:Tag « ${created.label}:label: » créé.`,
    );
    return null;
  };

  protected readonly rename: RenameTagFn = async (id, label) => {
    if (await this.store.renameTag(id, label)) return null;
    return this.afterRowFailure(this.store.rowProblem());
  };

  protected readonly merge: MergeTagFn = async (sourceId, targetId) => {
    const source = this.store.list().find((tag) => tag.id === sourceId)?.label ?? '';
    const target = await this.store.mergeTag(sourceId, targetId);
    if (!target) return this.afterRowFailure(this.store.rowProblem());
    this.toasts.success(
      $localize`:Toast après une fusion de tags@@vocabulary.tags.merge.done:« ${source}:source: » fusionné dans « ${target.label}:target: ». Patients et entrées sont réétiquetés en arrière-plan : un écran déjà ouvert peut montrer l'ancien libellé quelques secondes.`,
    );
    return null;
  };

  /** Tag fusionné ou supprimé ailleurs : la liste affichée est périmée, on la relit. */
  private afterRowFailure(problem: ApiProblem | null): ApiProblem | null {
    if (problem?.code === 'TAG_NOT_FOUND') void this.store.load();
    return problem;
  }
}
