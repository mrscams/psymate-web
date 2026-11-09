import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
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
import { PatientApi } from './patient.api';
import {
  isDemoPatient,
  PATIENT_SORTS,
  PatientListQuery,
  PatientSort,
  PatientView,
} from './patient.model';

/** Clé du tri mémorisé (fiche 01 : « tri persistant par praticien, localStorage »). */
export const SORT_STORAGE_KEY = 'patients.sort';

/** Le filtre ne part au serveur qu'à partir de 2 caractères (fiche 01). */
export const MIN_QUERY_LENGTH = 2;

interface PatientListState {
  /** Texte saisi dans le filtre ; seul effectiveQuery est envoyé. */
  query: string;
  archived: boolean;
  tag: string | null;
  sort: PatientSort;
  page: Loadable<CursorPage<PatientView>>;
  /** « Afficher plus » en cours, et son erreur (la liste déjà affichée reste). */
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
  /** Utilisateur de la session à qui appartiennent filtres et page (remise à zéro sinon). */
  owner: string | null;
  /**
   * Dernière écriture lancée depuis la liste et refusée : retrait de la démo, ou restauration (toast
   * « Restaurer » de la liste comme de la fiche, ligne d'un archivé). Effacée par la relecture
   * suivante (filtre, tri, Réessayer) et par toute nouvelle écriture.
   */
  actionProblem: ListActionProblem | null;
}

/** Écriture refusée depuis la liste : laquelle, et le problème de l'API. */
export interface ListActionProblem {
  action: 'removeDemo' | 'restore';
  problem: ApiProblem;
}

const initialState: PatientListState = {
  query: '',
  archived: false,
  tag: null,
  sort: 'name',
  page: idle(),
  loadingMore: false,
  moreProblem: null,
  owner: null,
  actionProblem: null,
};

export function effectiveQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  return trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '';
}

function readSort(): PatientSort | null {
  try {
    const value = localStorage.getItem(SORT_STORAGE_KEY);
    return PATIENT_SORTS.includes(value as PatientSort) ? (value as PatientSort) : null;
  } catch {
    return null;
  }
}

function writeSort(sort: PatientSort): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    // Stockage indisponible (navigation privée) : le tri vaut pour la session seulement.
  }
}

/**
 * Liste des patients (fiche 01) : filtres, tri, page courante par curseur, puces de tags.
 * Fourni à la racine : les filtres survivent à l'ouverture d'un dossier, et le toast « Restaurer »
 * (posé après un archivage depuis la fiche) peut relire la liste. Si l'utilisateur de la session a
 * changé depuis le dernier chargement (déconnexion puis autre compte dans le même onglet), tout
 * repart de zéro : ni patients ni filtres d'un compte ne s'affichent pour le suivant. Chaque changement de filtre
 * relit la première page ; une réponse arrivée après une requête plus récente est ignorée.
 */
export const PatientListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    effectiveQuery: computed(() => effectiveQuery(store.query())),
    items: computed(() => store.page().data?.items ?? []),
    hasMore: computed(() => (store.page().data?.nextCursor ?? null) !== null),
    filtered: computed(
      () => effectiveQuery(store.query()) !== '' || store.tag() !== null || store.archived(),
    ),
  })),
  withComputed((store) => ({
    /**
     * Accueil de la première connexion (B3 flux 1, planche 29) : liste sans filtre lue, complète,
     * et aucun patient en dehors des patients de démonstration (zéro patient compris). Dérivé de la
     * page lue, jamais mémorisé : dès le premier vrai patient, la liste prend sa forme normale.
     */
    welcome: computed(() => {
      const data = store.page().data;
      if (!data || store.filtered() || data.nextCursor !== null) return false;
      return data.items.every((patient) => isDemoPatient(patient));
    }),
  })),
  withMethods((store, api = inject(PatientApi), session = inject(SessionStore)) => {
    let request = 0;

    function query(cursor: string | null = null): PatientListQuery {
      return {
        q: store.effectiveQuery(),
        archived: store.archived(),
        tag: store.tag(),
        sort: store.sort(),
        cursor,
      };
    }

    async function reload(): Promise<void> {
      const ticket = ++request;
      patchState(store, {
        page: loading(store.page()),
        loadingMore: false,
        moreProblem: null,
        actionProblem: null,
      });
      try {
        const page = await api.list(query());
        if (ticket === request) patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
      }
    }

    return {
      /** Arrivée sur la liste : tri mémorisé, puis première page (la précédente reste affichée). */
      async load(): Promise<void> {
        const owner = session.me()?.id ?? null;
        if (owner !== store.owner()) patchState(store, { ...initialState, owner });
        const sort = readSort();
        if (sort) patchState(store, { sort });
        await reload();
      },

      reload,

      /** Filtre saisi ; ne relit que si le texte effectif (≥ 2 caractères) change. */
      async setQuery(text: string): Promise<void> {
        const before = store.effectiveQuery();
        patchState(store, { query: text });
        if (store.effectiveQuery() !== before) await reload();
      },

      async setSort(sort: PatientSort): Promise<void> {
        if (sort === store.sort()) return;
        patchState(store, { sort });
        writeSort(sort);
        await reload();
      },

      async setTag(tag: string | null): Promise<void> {
        if (tag === store.tag()) return;
        patchState(store, { tag });
        await reload();
      },

      async setArchived(archived: boolean): Promise<void> {
        if (archived === store.archived()) return;
        patchState(store, { archived });
        await reload();
      },

      /** « Effacer les filtres » de l'état vide. */
      async clearFilters(): Promise<void> {
        patchState(store, { query: '', tag: null, archived: false });
        await reload();
      },

      /** « Afficher plus » : page suivante concaténée, sans doublon. */
      async loadMore(): Promise<void> {
        const current = store.page().data;
        if (!current?.nextCursor || store.loadingMore()) return;
        const ticket = request;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.list(query(current.nextCursor));
          if (ticket !== request) return;
          patchState(store, {
            page: loaded(appendPage(current, next, (patient) => patient.id)),
            loadingMore: false,
          });
        } catch (error) {
          if (ticket === request) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
        }
      },

      /**
       * « Supprimer la démo » : DELETE /api/patients/{id} (archivage logique, restaurable), puis
       * relecture de la liste (on relit, on ne retire pas la ligne localement). false si l'API refuse.
       */
      async removeDemo(id: string): Promise<boolean> {
        patchState(store, { actionProblem: null });
        try {
          await api.archive(id);
        } catch (error) {
          patchState(store, {
            actionProblem: { action: 'removeDemo', problem: asProblem(error) },
          });
          return false;
        }
        await reload();
        return true;
      },

      /**
       * « Restaurer » (toast après un archivage, depuis la fiche ou la liste ; ligne d'un archivé) :
       * POST /restore puis relecture de la liste, qui efface aussi un retrait refusé auparavant.
       */
      async restore(id: string): Promise<PatientView | null> {
        patchState(store, { actionProblem: null });
        try {
          const patient = await api.restore(id);
          await reload();
          return patient;
        } catch (error) {
          patchState(store, { actionProblem: { action: 'restore', problem: asProblem(error) } });
          return null;
        }
      },
    };
  }),
);
