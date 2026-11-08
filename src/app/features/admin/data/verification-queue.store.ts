import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import {
  appendPage,
  CursorPage,
  failed,
  idle,
  Loadable,
  loaded,
  loading,
} from '../../../shared/util';
import { AdminApi } from './admin.api';
import { QueueItem, QueueStatus, StatusCounts } from './admin.model';

interface QueueState {
  status: QueueStatus;
  page: Loadable<CursorPage<QueueItem>>;
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
  /** Nombre de dossiers par statut (compteurs de GET /api/admin/practitioners) ; null si inconnu. */
  counts: StatusCounts | null;
}

const initialState: QueueState = {
  status: 'under_review',
  page: idle(),
  loadingMore: false,
  moreProblem: null,
  counts: null,
};

/**
 * File de vérification (fiche 20) : dossiers du plus ancien au plus récent, filtre En attente /
 * Complément demandé, « Afficher plus » par curseur. Le total « À vérifier · n » vient des
 * compteurs de la liste des comptes (la file n'en donne pas). Fourni par la page.
 */
export const VerificationQueueStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    items: computed(() => store.page().data?.items ?? []),
    hasMore: computed(() => (store.page().data?.nextCursor ?? null) !== null),
    total: computed(() => store.counts()?.[store.status()] ?? null),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;

    async function loadCounts(): Promise<void> {
      try {
        const page = await api.accounts({
          q: '',
          status: null,
          role: 'practitioner',
          profession: null,
          cursor: null,
          limit: 1,
        });
        patchState(store, { counts: page.counts });
      } catch {
        // Le compteur est un complément : la file reste utilisable sans lui.
        patchState(store, { counts: null });
      }
    }

    async function reload(): Promise<void> {
      const ticket = ++request;
      patchState(store, { page: loading(store.page()), loadingMore: false, moreProblem: null });
      void loadCounts();
      try {
        const page = await api.queue(store.status(), null);
        if (ticket === request) patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
      }
    }

    return {
      reload,

      /** Filtre de la file ; la liste repart de la première page. */
      async setStatus(status: QueueStatus): Promise<void> {
        if (status === store.status() && store.page().status !== 'idle') return;
        patchState(store, { status, page: idle() });
        await reload();
      },

      async loadMore(): Promise<void> {
        const current = store.page().data;
        if (!current?.nextCursor || store.loadingMore()) return;
        const ticket = request;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.queue(store.status(), current.nextCursor);
          if (ticket !== request) return;
          patchState(store, {
            page: loaded(appendPage(current, next, (item) => item.practitionerId)),
            loadingMore: false,
          });
        } catch (error) {
          if (ticket === request) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
        }
      },

      /** Dossier qui suit `id` dans la file affichée (ou le précédent s'il était le dernier). */
      neighbourOf(id: string): string | null {
        const items = store.page().data?.items ?? [];
        const index = items.findIndex((item) => item.practitionerId === id);
        if (index < 0) return items[0]?.practitionerId ?? null;
        return (items[index + 1] ?? items[index - 1])?.practitionerId ?? null;
      },
    };
  }),
);
