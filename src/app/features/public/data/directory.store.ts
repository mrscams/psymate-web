import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { sameQuery } from './directory-query';
import { DirectoryApi } from './directory.api';
import { DirectoryPage, DirectoryQuery } from './directory.models';

interface DirectoryState {
  /** Dernière recherche demandée (celle de l'URL). */
  query: DirectoryQuery | null;
  /** Résultat de la dernière recherche aboutie ; il reste affiché pendant la suivante (grisé). */
  result: Loadable<DirectoryPage>;
  /** 429 : instant (ms) avant lequel aucune recherche ne part (fiche 08, G Q24). */
  rateLimitedUntil: number | null;
  /** Recherche demandée pendant le délai d'un 429, lancée à sa fin. */
  deferred: DirectoryQuery | null;
}

const initialState: DirectoryState = {
  query: null,
  result: idle<DirectoryPage>(),
  rateLimitedUntil: null,
  deferred: null,
};

/**
 * État serveur de l'annuaire public (fiche 08, « PublicDirectoryStore ») : recherche courante,
 * page de résultats avec facettes, délai d'un 429. Fourni à la racine : revenir de la fiche
 * retrouve la liste sans attendre. L'état d'écran (saisie, filtres repliés) reste dans la page.
 */
export const DirectoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ result }) => ({
    page: computed(() => result().data),
    facets: computed(() => result().data?.facets ?? null),
  })),
  withMethods((store, api = inject(DirectoryApi)) => {
    let seq = 0;

    const blocked = (now: number) => {
      const until = store.rateLimitedUntil();
      return until !== null && now < until;
    };

    const run = async (query: DirectoryQuery): Promise<void> => {
      const mine = ++seq;
      patchState(store, { query, deferred: null, result: loading(store.result()) });
      try {
        const page = await api.search(query);
        if (mine !== seq) return; // une recherche plus récente est partie : on l'attend
        patchState(store, { result: loaded(page), rateLimitedUntil: null });
      } catch (error) {
        if (mine !== seq) return;
        const problem = asProblem(error);
        patchState(store, { result: failed(problem, store.result()) });
        if (problem.status === 429) {
          // Retenue : elle repart d'elle-même à la fin du délai (resume).
          patchState(store, {
            rateLimitedUntil: Date.now() + (problem.retryAfterSeconds ?? 60) * 1000,
            deferred: query,
          });
        }
      }
    };

    return {
      /**
       * GET /api/public/directory pour cette recherche. Même recherche déjà chargée (ou en cours) :
       * rien ne part. Pendant le délai d'un 429, la recherche est retenue et part à la fin
       * (`resume`), sans relancer avant (fiche 08).
       */
      async search(query: DirectoryQuery, options: { force?: boolean } = {}): Promise<void> {
        const current = store.query();
        const status = store.result().status;
        if (
          !options.force &&
          current &&
          sameQuery(current, query) &&
          (status === 'loaded' || status === 'loading')
        ) {
          return;
        }
        if (blocked(Date.now())) {
          patchState(store, { query, deferred: query });
          return;
        }
        await run(query);
      },

      /** 429 vu par l'intercepteur (avis HttpNotices) : aucune recherche avant la fin du délai. */
      rateLimited(seconds: number | null, now = Date.now()): void {
        patchState(store, { rateLimitedUntil: now + (seconds ?? 60) * 1000 });
      },

      /** Fin du délai : la recherche retenue part, s'il y en a une. */
      async resume(now = Date.now()): Promise<void> {
        if (blocked(now)) return;
        patchState(store, { rateLimitedUntil: null });
        const deferred = store.deferred();
        if (deferred) await run(deferred);
      },
    };
  }),
);
