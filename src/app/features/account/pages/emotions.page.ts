import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { AccountNavComponent, StateComponent, ToastService } from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import { EmotionFamily } from '../data/emotions.api';
import { EmotionsStore } from '../data/emotions.store';
import {
  CustomEmotionsComponent,
  MergeEmotionFn,
  RenameEmotionFn,
} from '../ui/vocabulary/custom-emotions.component';
import { CreateEmotionFn, EmotionFormComponent } from '../ui/vocabulary/emotion-form.component';
import { GlobalVocabularyComponent } from '../ui/vocabulary/global-vocabulary.component';
import { MergeJournalComponent } from '../ui/vocabulary/merge-journal.component';
import { undoProblemMessage } from '../ui/vocabulary/vocabulary-messages';
import { professionLabel } from './preferences.page';

/** Lien vers la page des tags (absente de la navigation Mon compte, fiche 00 §3). */
export const TAGS_PATH = '/mon-compte/tags';

/**
 * /mon-compte/emotions (fiche 17, M1-09) : ajouter une émotion personnalisée, la renommer, la
 * fusionner dans une autre (aperçu, annulation 30 jours depuis le journal des fusions), et le
 * vocabulaire global en lecture seule. Promotion au global : V2 (G Q8), aucun bouton.
 */
@Component({
  selector: 'pm-emotions-page',
  imports: [
    RouterLink,
    AccountNavComponent,
    StateComponent,
    EmotionFormComponent,
    CustomEmotionsComponent,
    MergeJournalComponent,
    GlobalVocabularyComponent,
  ],
  providers: [EmotionsStore],
  templateUrl: './emotions.page.html',
  styleUrl: './vocabulary.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmotionsPage {
  protected readonly store = inject(EmotionsStore);
  protected readonly session = inject(SessionStore);
  private readonly toasts = inject(ToastService);

  protected readonly tagsPath = TAGS_PATH;
  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );
  protected readonly all = computed(() => this.store.emotions().data ?? []);

  /** Trois états de la liste : squelette, erreur (Réessayer), vide (aucune personnalisée). */
  protected readonly listState = computed<StateKind | null>(() => {
    const emotions = this.store.emotions();
    if (emotions.data === null) return emotions.status === 'error' ? 'error' : 'loading';
    return this.store.customs().length === 0 ? 'empty' : null;
  });

  /** Titre de l'état erreur (la phrase reste celle de pm-state). */
  protected readonly errorTitle = $localize`:Titre de l'état erreur des émotions personnalisées@@vocabulary.mine.errorTitle:Impossible de charger vos émotions personnalisées`;
  /** Textes de l'état vide. */
  protected readonly empty = {
    title: $localize`:Titre de l'état vide des émotions@@vocabulary.mine.emptyTitle:Aucune émotion personnalisée`,
    message: $localize`:Message de l'état vide des émotions@@vocabulary.mine.emptyMessage:Ajoutez-en une avec le formulaire ci-dessus quand le vocabulaire global ne suffit pas.`,
  };

  protected readonly retry = {
    label: $localize`:Bouton Réessayer de la liste des émotions@@vocabulary.retry:Réessayer`,
    handler: (): void => void this.store.reload(),
  };

  protected readonly undoError = computed(() => {
    const problem = this.store.undoProblem();
    return problem ? undoProblemMessage(problem) : null;
  });

  constructor() {
    void this.store.load();
  }

  protected readonly create: CreateEmotionFn = async (labelFr, family: EmotionFamily) => {
    const created = await this.store.createEmotion(labelFr, family);
    if (!created) return this.store.createProblem();
    this.toasts.success(
      $localize`:Toast après l'ajout d'une émotion@@vocabulary.add.done:« ${created.labelFr}:label: » ajoutée à votre vocabulaire.`,
    );
    return null;
  };

  protected readonly rename: RenameEmotionFn = async (code, labelFr) => {
    if (await this.store.renameEmotion(code, labelFr)) return null;
    return this.afterRowFailure(this.store.rowProblem());
  };

  protected readonly merge: MergeEmotionFn = async (sourceCode, targetCode) => {
    const source = this.store.byCode().get(sourceCode)?.labelFr ?? '';
    const target = this.store.byCode().get(targetCode)?.labelFr ?? '';
    const merge = await this.store.mergeEmotion(sourceCode, targetCode);
    if (!merge) return this.afterRowFailure(this.store.rowProblem());
    const count = merge.affectedCount;
    this.toasts.success(
      count <= 1
        ? $localize`:Toast après une fusion d'émotions, un ressenti@@vocabulary.merge.done.one:« ${source}:source: » fusionnée dans « ${target}:target: » : ${count}:count: ressenti déplacé.`
        : $localize`:Toast après une fusion d'émotions@@vocabulary.merge.done:« ${source}:source: » fusionnée dans « ${target}:target: » : ${count}:count: ressentis déplacés.`,
      {
        label: $localize`:Action Annuler du toast de fusion@@vocabulary.merge.undo:Annuler`,
        handler: () => this.undo(merge.id),
      },
    );
    return null;
  };

  protected readonly undo = (mergeId: string): void => {
    const entry = this.store.journal().find((e) => e.merge.id === mergeId);
    void this.store.undoMerge(mergeId).then((done) => {
      if (done && entry) {
        this.toasts.success(
          $localize`:Toast après l'annulation d'une fusion@@vocabulary.journal.undoDone:Fusion annulée : « ${entry.sourceLabel}:source: » est de retour avec ses ressentis.`,
        );
      }
    });
  };

  /** Source déjà fusionnée ou introuvable : la liste affichée est périmée, on la relit. */
  private afterRowFailure(problem: ApiProblem | null): ApiProblem | null {
    if (problem?.code === 'EMOTION_INACTIVE' || problem?.code === 'EMOTION_NOT_FOUND') {
      void this.store.reload();
    }
    return problem;
  }
}
