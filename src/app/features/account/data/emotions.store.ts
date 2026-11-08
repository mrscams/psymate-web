import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { Emotion, EmotionFamily, EmotionMerge, EmotionsApi } from './emotions.api';
import { MergeJournalEntry, readJournal, writeJournal } from './merge-journal';

interface EmotionsState {
  /** GET /api/vocabulary/emotions : globales et personnalisées actives. */
  emotions: Loadable<Emotion[]>;
  /** Ajout (POST /api/me/emotions). */
  creating: boolean;
  createProblem: ApiProblem | null;
  /** Renommage ou fusion en cours sur une ligne (code de l'émotion source), et son erreur. */
  busyCode: string | null;
  rowProblem: ApiProblem | null;
  /** Fusions faites depuis ce navigateur pour ce compte, la plus récente d'abord. */
  journal: MergeJournalEntry[];
  /** Annulation en cours (id de la fusion), et son erreur. */
  undoing: string | null;
  undoProblem: ApiProblem | null;
  /** Utilisateur de la session pour qui le journal a été lu. */
  owner: string | null;
}

const initialState: EmotionsState = {
  emotions: idle(),
  creating: false,
  createProblem: null,
  busyCode: null,
  rowProblem: null,
  journal: [],
  undoing: null,
  undoProblem: null,
  owner: null,
};

/**
 * Vocabulaire des émotions du praticien (fiche 17), fourni par la page /mon-compte/emotions. Après
 * chaque écriture, la liste est relue (GET /api/vocabulary/emotions), jamais recalculée localement.
 */
export const EmotionsStore = signalStore(
  withState(initialState),
  withComputed(({ emotions }) => {
    const all = computed(() => emotions().data ?? []);
    return {
      globals: computed(() => all().filter((e) => e.scope === 'global')),
      customs: computed(() => all().filter((e) => e.scope === 'custom')),
      byCode: computed(() => new Map(all().map((e) => [e.code, e]))),
    };
  }),
  withMethods((store, api = inject(EmotionsApi), session = inject(SessionStore)) => {
    async function reload(): Promise<void> {
      patchState(store, { emotions: loading(store.emotions()) });
      try {
        patchState(store, { emotions: loaded(await api.list()) });
      } catch (error) {
        patchState(store, { emotions: failed(asProblem(error), store.emotions()) });
      }
    }

    function saveJournal(journal: MergeJournalEntry[]): void {
      patchState(store, { journal });
      writeJournal(store.owner(), journal);
    }

    function updateEntry(id: string, change: (entry: MergeJournalEntry) => MergeJournalEntry) {
      saveJournal(store.journal().map((entry) => (entry.merge.id === id ? change(entry) : entry)));
    }

    return {
      /** Liste et journal du compte connecté ; la donnée précédente reste pendant le rechargement. */
      async load(): Promise<void> {
        const owner = session.me()?.id ?? null;
        if (owner !== store.owner()) {
          patchState(store, { ...initialState, owner, journal: readJournal(owner) });
        }
        await reload();
      },

      reload,

      /** POST /api/me/emotions puis relecture ; l'erreur (409, 422) reste dans createProblem. */
      async createEmotion(labelFr: string, family: EmotionFamily): Promise<Emotion | null> {
        patchState(store, { creating: true, createProblem: null });
        try {
          const created = await api.create(labelFr.trim(), family);
          patchState(store, { creating: false });
          await reload();
          return created;
        } catch (error) {
          patchState(store, { creating: false, createProblem: asProblem(error) });
          return null;
        }
      },

      clearCreateProblem(): void {
        patchState(store, { createProblem: null });
      },

      /** PATCH /api/me/emotions/{code} puis relecture ; l'erreur reste dans rowProblem. */
      async renameEmotion(code: string, labelFr: string): Promise<boolean> {
        patchState(store, { busyCode: code, rowProblem: null });
        try {
          await api.rename(code, labelFr.trim());
          patchState(store, { busyCode: null });
          await reload();
          return true;
        } catch (error) {
          patchState(store, { busyCode: null, rowProblem: asProblem(error) });
          return false;
        }
      },

      /**
       * POST /api/me/emotions/{code}/merge : le reçu (id, affectedCount, undoUntil) entre dans le
       * journal avec les libellés du moment, puis la liste est relue (la source en disparaît).
       */
      async mergeEmotion(sourceCode: string, targetCode: string): Promise<EmotionMerge | null> {
        const source = store.byCode().get(sourceCode);
        const target = store.byCode().get(targetCode);
        patchState(store, { busyCode: sourceCode, rowProblem: null });
        try {
          const merge = await api.merge(sourceCode, targetCode);
          const entry: MergeJournalEntry = {
            merge,
            sourceLabel: source?.labelFr ?? sourceCode,
            targetLabel: target?.labelFr ?? targetCode,
          };
          saveJournal([entry, ...store.journal().filter((e) => e.merge.id !== merge.id)]);
          patchState(store, { busyCode: null });
          await reload();
          return merge;
        } catch (error) {
          patchState(store, { busyCode: null, rowProblem: asProblem(error) });
          return null;
        }
      },

      clearRowProblem(): void {
        patchState(store, { rowProblem: null });
      },

      /**
       * POST /api/me/emotions/merges/{id}/undo puis relecture (la source revient). Refus : déjà
       * annulée ou délai dépassé → l'entrée du journal le dit ; fusion inconnue → elle en sort.
       */
      async undoMerge(mergeId: string): Promise<boolean> {
        patchState(store, { undoing: mergeId, undoProblem: null });
        try {
          const merge = await api.undo(mergeId);
          updateEntry(mergeId, (entry) => ({ ...entry, merge: { ...entry.merge, ...merge } }));
          patchState(store, { undoing: null });
          await reload();
          return true;
        } catch (error) {
          const problem = asProblem(error);
          if (problem.code === 'MERGE_UNDO_EXPIRED') {
            updateEntry(mergeId, (entry) => ({ ...entry, expired: true }));
          } else if (problem.code === 'MERGE_ALREADY_UNDONE') {
            updateEntry(mergeId, (entry) => ({
              ...entry,
              merge: { ...entry.merge, undoneAt: entry.merge.undoneAt ?? new Date().toISOString() },
            }));
          } else if (problem.code === 'MERGE_NOT_FOUND') {
            saveJournal(store.journal().filter((entry) => entry.merge.id !== mergeId));
          }
          patchState(store, { undoing: null, undoProblem: problem });
          return false;
        }
      },
    };
  }),
);
