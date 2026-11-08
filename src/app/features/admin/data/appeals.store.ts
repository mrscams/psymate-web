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
import { Appeal, AppealOutcome } from './admin.model';

interface AppealsState {
  page: Loadable<CursorPage<Appeal>>;
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
}

const initialState: AppealsState = { page: idle(), loadingMore: false, moreProblem: null };

/**
 * Recours ouverts (fiche 27 côté administration, G Q28) : du plus ancien au plus récent ;
 * accepter réactive le compte, écarter le laisse en l'état ; la liste est relue après chaque
 * décision. Fourni par la page Praticiens.
 */
export const AppealsStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    items: computed(() => store.page().data?.items ?? []),
    hasMore: computed(() => (store.page().data?.nextCursor ?? null) !== null),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;

    async function load(): Promise<void> {
      const ticket = ++request;
      patchState(store, { page: loading(store.page()), loadingMore: false, moreProblem: null });
      try {
        const page = await api.openAppeals(null);
        if (ticket === request) patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
      }
    }

    return {
      load,

      async loadMore(): Promise<void> {
        const current = store.page().data;
        if (!current?.nextCursor || store.loadingMore()) return;
        const ticket = request;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.openAppeals(current.nextCursor);
          if (ticket !== request) return;
          patchState(store, {
            page: loaded(appendPage(current, next, (appeal) => appeal.id)),
            loadingMore: false,
          });
        } catch (error) {
          if (ticket === request) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
        }
      },

      /** POST /api/admin/appeals/{id}/decision ; null si fait (liste relue). */
      async decide(
        id: string,
        outcome: AppealOutcome,
        message: string,
      ): Promise<ApiProblem | null> {
        try {
          await api.decideAppeal(id, outcome, message);
        } catch (error) {
          return asProblem(error);
        }
        await load();
        return null;
      },
    };
  }),
);
