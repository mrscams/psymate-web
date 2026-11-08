import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { Tag, TagsApi } from './tags.api';

/** Émotion proposée par un 422 TAG_IS_EMOTION (propriété suggestedEmotion du problème). */
export interface SuggestedEmotion {
  code: string;
  labelFr: string;
}

/** suggestedEmotion d'un TAG_IS_EMOTION, ou null (autre erreur, propriété absente ou illisible). */
export function suggestedEmotion(problem: ApiProblem | null): SuggestedEmotion | null {
  if (problem?.code !== 'TAG_IS_EMOTION') return null;
  const raw = problem.extra?.['suggestedEmotion'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { code, labelFr } = raw as Record<string, unknown>;
  return typeof code === 'string' && typeof labelFr === 'string' ? { code, labelFr } : null;
}

interface TagsState {
  /** GET /api/tags : tags actifs du praticien. */
  tags: Loadable<Tag[]>;
  /** Création (POST /api/tags) : TAG_EXISTS, TAG_IS_EMOTION, VALIDATION_FAILED. */
  creating: boolean;
  createProblem: ApiProblem | null;
  /** Renommage ou fusion en cours (id du tag source), et son erreur. */
  busyId: string | null;
  rowProblem: ApiProblem | null;
}

const initialState: TagsState = {
  tags: idle(),
  creating: false,
  createProblem: null,
  busyId: null,
  rowProblem: null,
};

/**
 * Tags du praticien pour /mon-compte/tags (fournis par la page). Après chaque écriture la liste
 * est relue (GET /api/tags). La réétiquette des patients et des entrées après une fusion est
 * asynchrone côté API (G Q42) : un écran patient peut montrer l'ancien libellé quelques secondes.
 */
export const TagsStore = signalStore(
  withState(initialState),
  withComputed(({ tags }) => ({
    list: computed(() => tags().data ?? []),
  })),
  withMethods((store, api = inject(TagsApi)) => {
    async function load(): Promise<void> {
      patchState(store, { tags: loading(store.tags()) });
      try {
        patchState(store, { tags: loaded(await api.list()) });
      } catch (error) {
        patchState(store, { tags: failed(asProblem(error), store.tags()) });
      }
    }

    return {
      load,

      async createTag(label: string): Promise<Tag | null> {
        patchState(store, { creating: true, createProblem: null });
        try {
          const created = await api.create(label.trim());
          patchState(store, { creating: false });
          await load();
          return created;
        } catch (error) {
          patchState(store, { creating: false, createProblem: asProblem(error) });
          return null;
        }
      },

      clearCreateProblem(): void {
        patchState(store, { createProblem: null });
      },

      async renameTag(id: string, label: string): Promise<boolean> {
        patchState(store, { busyId: id, rowProblem: null });
        try {
          await api.rename(id, label.trim());
          patchState(store, { busyId: null });
          await load();
          return true;
        } catch (error) {
          patchState(store, { busyId: null, rowProblem: asProblem(error) });
          return false;
        }
      },

      /** POST /api/tags/{id}/merge ; renvoie la cible mise à jour (usages additionnés). */
      async mergeTag(sourceId: string, targetId: string): Promise<Tag | null> {
        patchState(store, { busyId: sourceId, rowProblem: null });
        try {
          const target = await api.merge(sourceId, targetId);
          patchState(store, { busyId: null });
          await load();
          return target;
        } catch (error) {
          patchState(store, { busyId: null, rowProblem: asProblem(error) });
          return null;
        }
      },

      clearRowProblem(): void {
        patchState(store, { rowProblem: null });
      },
    };
  }),
);
