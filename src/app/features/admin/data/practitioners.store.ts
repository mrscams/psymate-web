import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AdminApi } from './admin.api';
import { AccountPage, AccountRole, CountedStatus, Profession } from './admin.model';

/** Filtres de la liste, repris dans l'URL (fiche 21). */
export interface PractitionerFilters {
  q: string;
  status: CountedStatus | null;
  role: AccountRole | null;
  profession: Profession | null;
}

export const DEFAULT_FILTERS: PractitionerFilters = {
  q: '',
  status: null,
  role: 'practitioner',
  profession: null,
};

interface PractitionersState {
  filters: PractitionerFilters;
  page: Loadable<AccountPage>;
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
}

const initialState: PractitionersState = {
  filters: DEFAULT_FILTERS,
  page: idle(),
  loadingMore: false,
  moreProblem: null,
};

function sameFilters(a: PractitionerFilters, b: PractitionerFilters): boolean {
  return a.q === b.q && a.status === b.status && a.role === b.role && a.profession === b.profession;
}

/**
 * Comptes (fiche 21) : recherche, statut, rôle, profession, compteurs par statut, « Afficher plus ».
 * Suspendre et réactiver relisent la liste (le serveur dit le nouveau statut). Fourni par la page.
 */
export const PractitionersStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    items: computed(() => store.page().data?.items ?? []),
    counts: computed(() => store.page().data?.counts ?? null),
    hasMore: computed(() => (store.page().data?.nextCursor ?? null) !== null),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;

    async function reload(): Promise<void> {
      const ticket = ++request;
      patchState(store, { page: loading(store.page()), loadingMore: false, moreProblem: null });
      try {
        const page = await api.accounts({ ...store.filters(), cursor: null });
        if (ticket === request) patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
      }
    }

    return {
      reload,

      /** Filtres venus de l'URL ; relit seulement s'ils changent (ou au premier passage). */
      async setFilters(filters: PractitionerFilters): Promise<void> {
        if (sameFilters(filters, store.filters()) && store.page().status !== 'idle') return;
        patchState(store, { filters });
        await reload();
      },

      async loadMore(): Promise<void> {
        const current = store.page().data;
        if (!current?.nextCursor || store.loadingMore()) return;
        const ticket = request;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.accounts({ ...store.filters(), cursor: current.nextCursor });
          if (ticket !== request) return;
          const seen = new Set(current.items.map((item) => item.id));
          patchState(store, {
            page: loaded({
              items: [...current.items, ...next.items.filter((item) => !seen.has(item.id))],
              nextCursor: next.nextCursor,
              counts: next.counts,
            }),
            loadingMore: false,
          });
        } catch (error) {
          if (ticket === request) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
        }
      },

      /** POST …/suspend ; null si fait (liste relue), sinon le problème pour la boîte de dialogue. */
      async suspend(id: string, reason: string): Promise<ApiProblem | null> {
        try {
          await api.suspend(id, reason);
        } catch (error) {
          return asProblem(error);
        }
        await reload();
        return null;
      },

      /** POST …/reactivate ; null si fait (liste relue). */
      async reactivate(id: string, reason: string): Promise<ApiProblem | null> {
        try {
          await api.reactivate(id, reason);
        } catch (error) {
          return asProblem(error);
        }
        await reload();
        return null;
      },
    };
  }),
);
