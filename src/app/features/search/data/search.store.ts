import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { SearchApi } from './search.api';
import {
  effectiveQuery,
  EMPTY_FILTERS,
  EntryPreview,
  sameFilters,
  SearchFilters,
  SearchHit,
  SearchPage,
  SessionOption,
  toRequest,
} from './search.model';

interface SearchState {
  patientId: string | null;
  filters: SearchFilters;
  results: Loadable<SearchPage>;
  /** « Afficher les N autres » en cours, et son erreur (la liste déjà affichée reste). */
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
  /** Résultat sélectionné (↑ ↓, clic) : celui de l'aperçu et d'Entrée. */
  selectedId: string | null;
  preview: Loadable<EntryPreview>;
  sessions: Loadable<SessionOption[]>;
}

const initialState: SearchState = {
  patientId: null,
  filters: EMPTY_FILTERS,
  results: idle(),
  loadingMore: false,
  moreProblem: null,
  selectedId: null,
  preview: idle(),
  sessions: idle(),
};

/**
 * Recherche dans le dossier d'un patient (fiche 07, B3 flux 5). Fourni par la page : les filtres
 * viennent de l'URL (la page appelle `apply`), le serveur fait tout le travail (syntaxe tag:,
 * émotion:, avant:, après: ; trigrammes ; compteurs par type sans le filtre de type ; entrées
 * privées d'un autre praticien jamais renvoyées). Rien ne part sous 2 caractères. Une réponse
 * arrivée après une requête plus récente est ignorée. La sélection suit ↑ ↓ sur les résultats
 * exacts puis approchés, et l'aperçu relit l'entrée sélectionnée en entier.
 */
export const SearchStore = signalStore(
  withState(initialState),
  withComputed((store) => {
    const exact = computed(() => store.results().data?.exact ?? []);
    const approximate = computed(() => store.results().data?.approximate ?? []);
    const hits = computed<SearchHit[]>(() => [...exact(), ...approximate()]);
    return {
      effectiveQuery: computed(() => effectiveQuery(store.filters().q)),
      exact,
      approximate,
      hits,
      selected: computed(() => hits().find((hit) => hit.entryId === store.selectedId()) ?? null),
      /** Résultats exacts pas encore chargés (« Afficher les N autres »). */
      remaining: computed(() => Math.max(0, (store.results().data?.total ?? 0) - exact().length)),
      /** Ce que « Afficher » charge vraiment : une page au plus. */
      nextCount: computed(() => {
        const page = store.results().data;
        if (!page) return 0;
        return Math.min(page.pageSize, Math.max(0, page.total - exact().length));
      }),
      /** Compteur de « Tous » : la somme des types, sans le filtre de type. */
      allCount: computed(() =>
        (store.results().data?.counts ?? []).reduce((sum, item) => sum + item.count, 0),
      ),
    };
  }),
  withMethods((store, api = inject(SearchApi)) => {
    let searchTicket = 0;
    let previewTicket = 0;
    let sessionsFor: string | null = null;

    async function loadPreview(entryId: string | null): Promise<void> {
      const ticket = ++previewTicket;
      if (!entryId) {
        patchState(store, { preview: idle() });
        return;
      }
      const previous = store.preview();
      patchState(store, {
        preview: previous.data?.id === entryId ? loading(previous) : loading<EntryPreview>(),
      });
      try {
        const preview = await api.preview(entryId);
        if (ticket === previewTicket) patchState(store, { preview: loaded(preview) });
      } catch (error) {
        if (ticket === previewTicket) {
          patchState(store, { preview: failed(asProblem(error), store.preview()) });
        }
      }
    }

    /** Sélectionne un résultat ; `force` relit l'aperçu même si la sélection ne change pas. */
    function select(entryId: string | null, force = false): void {
      if (!force && entryId === store.selectedId() && store.preview().status !== 'error') return;
      patchState(store, { selectedId: entryId });
      void loadPreview(entryId);
    }

    /**
     * Première page des filtres courants ; garde la sélection si elle est encore là. `reread` :
     * après une écriture, l'aperçu de la sélection conservée est relu lui aussi.
     */
    async function search(
      preferredId: string | null = store.selectedId(),
      reread = false,
    ): Promise<void> {
      const patientId = store.patientId();
      const ticket = ++searchTicket;
      patchState(store, { loadingMore: false, moreProblem: null });
      if (!patientId || !store.effectiveQuery()) {
        patchState(store, { results: idle(), selectedId: null, preview: idle() });
        previewTicket++;
        return;
      }
      patchState(store, { results: loading(store.results()) });
      try {
        const page = await api.find(patientId, toRequest(store.filters()));
        if (ticket !== searchTicket) return;
        patchState(store, { results: loaded(page) });
        const hits = store.hits();
        const keep = hits.find((hit) => hit.entryId === preferredId);
        select(keep?.entryId ?? hits[0]?.entryId ?? null, reread);
      } catch (error) {
        if (ticket === searchTicket) {
          patchState(store, { results: failed(asProblem(error), store.results()) });
        }
      }
    }

    async function loadSessions(patientId: string): Promise<void> {
      sessionsFor = patientId;
      patchState(store, { sessions: loading(store.sessions()) });
      try {
        const sessions = await api.sessions(patientId);
        if (sessionsFor === patientId) patchState(store, { sessions: loaded(sessions) });
      } catch (error) {
        if (sessionsFor === patientId) {
          patchState(store, { sessions: failed(asProblem(error), store.sessions()) });
        }
      }
    }

    return {
      /** Arrivée sur l'écran (ou autre patient) : remise à zéro et liste des séances. */
      open(patientId: string): void {
        if (store.patientId() === patientId) return;
        searchTicket++;
        previewTicket++;
        patchState(store, { ...initialState, patientId });
        void loadSessions(patientId);
      },

      /**
       * Filtres lus dans l'URL : cherche si la requête effective a changé (un caractère de moins
       * que 2 ne relance rien), sinon ne fait rien. `preferredId` : sélection à retrouver.
       */
      async apply(filters: SearchFilters, preferredId: string | null = null): Promise<void> {
        const unchanged =
          sameFilters(filters, store.filters()) && store.results().status !== 'idle';
        patchState(store, { filters });
        if (unchanged) return;
        await search(preferredId ?? store.selectedId());
      },

      /** Réessayer après une erreur, ou relire après une écriture (projection relue, CLAUDE.md). */
      refresh(): Promise<void> {
        return search(store.selectedId(), true);
      },

      /** Page suivante de résultats exacts, ajoutée à la liste (pas d'approchés après la page 1). */
      async more(): Promise<void> {
        const patientId = store.patientId();
        const current = store.results().data;
        // Pendant une nouvelle recherche, la page affichée est périmée : rien à prolonger.
        if (!patientId || !current || store.results().status !== 'loaded') return;
        if (store.loadingMore() || store.remaining() === 0) return;
        const ticket = searchTicket;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.find(patientId, toRequest(store.filters(), current.page + 1));
          if (ticket !== searchTicket) return;
          const known = new Set(current.exact.map((hit) => hit.entryId));
          patchState(store, {
            loadingMore: false,
            results: loaded({
              ...current,
              page: next.page,
              total: next.total,
              exact: [...current.exact, ...next.exact.filter((hit) => !known.has(hit.entryId))],
            }),
          });
        } catch (error) {
          if (ticket === searchTicket) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
        }
      },

      select,

      /** ↑ (-1) ou ↓ (+1) : la sélection reste dans la liste, sans boucler. */
      move(delta: number): void {
        const hits = store.hits();
        if (hits.length === 0) return;
        const index = hits.findIndex((hit) => hit.entryId === store.selectedId());
        const next = index < 0 ? 0 : Math.min(hits.length - 1, Math.max(0, index + delta));
        select(hits[next].entryId);
      },

      retryPreview(): void {
        void loadPreview(store.selectedId());
      },

      retrySessions(): void {
        const patientId = store.patientId();
        if (patientId) void loadSessions(patientId);
      },
    };
  }),
);

export type SearchStore = InstanceType<typeof SearchStore>;
