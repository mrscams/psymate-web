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
  ACTIVITY_LIMIT,
  apiSort,
  DEFAULT_SORT,
  hasFlags,
  hasSessionToday,
  isDemoPatient,
  PATIENT_SORTS,
  PatientActivity,
  PatientListQuery,
  PatientSort,
  PatientView,
  QuickFilter,
  sortRows,
} from './patient.model';

/** Clé du tri mémorisé (fiche 01 : « tri persistant par praticien, localStorage »). */
export const SORT_STORAGE_KEY = 'patients.sort';

/** Le filtre ne part au serveur qu'à partir de 2 caractères (fiche 01). */
export const MIN_QUERY_LENGTH = 2;

/** Résumés lus en parallèle (GET /overview), pour ne pas lancer vingt requêtes d'un coup. */
export const ACTIVITY_CONCURRENCY = 4;

/** Résumé d'activité d'une ligne : chargement, lu, ou en échec (la valeur précédente reste). */
export type ActivityCell = Loadable<PatientActivity>;

/** Ligne de la liste : la fiche (GET /api/patients) et son résumé, s'il a été demandé. */
export interface PatientListRow {
  patient: PatientView;
  /** null : au-delà des ACTIVITY_LIMIT premiers patients, aucun résumé n'est demandé. */
  cell: ActivityCell | null;
  activity: PatientActivity | null;
}

/**
 * Comptes des filtres rapides. `more` : une page suivante existe, « Tous » ne compte que les
 * patients chargés (affiché « 50+ ») et « Flags » n'a pas de compte ; `today` et `drafts` sont null
 * tant que chaque patient de la liste n'a pas son résumé.
 */
export interface QuickCounts {
  all: number;
  more: boolean;
  flags: number | null;
  today: number | null;
  drafts: number | null;
}

interface PatientListState {
  /** Texte saisi dans le filtre ; seul effectiveQuery est envoyé. */
  query: string;
  archived: boolean;
  tag: string | null;
  sort: PatientSort;
  /** Filtre rapide (Tous, Aujourd'hui, Flags, Brouillons), appliqué dans le client. */
  quick: QuickFilter;
  page: Loadable<CursorPage<PatientView>>;
  /** Résumés d'activité par identifiant de patient (ACTIVITY_LIMIT premiers de la page). */
  activity: Record<string, ActivityCell>;
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
  sort: DEFAULT_SORT,
  quick: 'all',
  page: idle(),
  activity: {},
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
 * Liste des patients (fiche 01, UX-B1) : filtres, tri, page courante par curseur, tag, filtre
 * rapide, et le résumé d'activité des ACTIVITY_LIMIT premières lignes (projection vue d'ensemble,
 * lue après la liste sans la retarder ; la liste du contrat ne porte ni séance ni émotion).
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
     * Chaque patient de la liste peut avoir son résumé : liste entière chargée (pas de page
     * suivante) et au plus ACTIVITY_LIMIT lignes. Sinon le tri « Dernière séance » et les filtres
     * « Aujourd'hui » / « Brouillons » ne sont pas proposés : ils ne porteraient que sur une partie.
     */
    activityCovered: computed(() => !store.hasMore() && store.items().length <= ACTIVITY_LIMIT),
  })),
  withComputed((store) => ({
    /**
     * Tri réellement appliqué : « Dernière séance » retombe sur « Dernière modification » (le tri
     * que le serveur fait, sort=updated) quand le résumé ne couvre pas toute la liste.
     */
    effectiveSort: computed<PatientSort>(() =>
      store.sort() === 'lastSession' && !store.activityCovered() ? 'updated' : store.sort(),
    ),
    /** Filtre rapide réellement appliqué : « Aujourd'hui » et « Brouillons » exigent la couverture. */
    effectiveQuick: computed<QuickFilter>(() => {
      const quick = store.quick();
      return (quick === 'today' || quick === 'drafts') && !store.activityCovered() ? 'all' : quick;
    }),
  })),
  withComputed((store) => ({
    /** Toutes les lignes lues, avec leur résumé, dans l'ordre du tri appliqué. */
    allRows: computed<PatientListRow[]>(() => {
      const activity = store.activity();
      const rows = store.items().map((patient) => {
        const cell = activity[patient.id] ?? null;
        return { patient, cell, activity: cell?.data ?? null };
      });
      return sortRows(rows, store.effectiveSort());
    }),
  })),
  withComputed((store) => ({
    /**
     * Le résumé couvre toute la page lue : chaque patient a le sien (lu ou en échec). Sinon les
     * filtres « Aujourd'hui » et « Brouillons » ne portent que sur les lignes résumées.
     */
    activityComplete: computed(() =>
      store.allRows().every((row) => row.cell !== null && row.cell.status !== 'loading'),
    ),
    /** Nombre de résumés qui n'ont pas pu être lus (avertissement « Réessayer » sous le tableau). */
    activityFailures: computed(
      () => store.allRows().filter((row) => row.cell?.status === 'error').length,
    ),
  })),
  withComputed((store) => ({
    quickCounts: computed<QuickCounts>(() => {
      const rows = store.allRows();
      const now = new Date();
      const complete = store.activityCovered() && store.activityComplete();
      const more = store.hasMore();
      return {
        all: rows.length,
        more,
        flags: more ? null : rows.filter((row) => hasFlags(row.patient)).length,
        today: complete ? rows.filter((row) => hasSessionToday(row.activity, now)).length : null,
        drafts: complete ? rows.filter((row) => (row.activity?.drafts ?? 0) > 0).length : null,
      };
    }),
    /** Lignes affichées : filtre rapide appliqué à la page lue. */
    rows: computed<PatientListRow[]>(() => {
      const now = new Date();
      const rows = store.allRows();
      switch (store.effectiveQuick()) {
        case 'all':
          return rows;
        case 'flags':
          return rows.filter((row) => hasFlags(row.patient));
        case 'today':
          return rows.filter((row) => hasSessionToday(row.activity, now));
        case 'drafts':
          return rows.filter((row) => (row.activity?.drafts ?? 0) > 0);
      }
    }),
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
    /** Génération des résumés : une relecture de la liste rend caducs ceux encore en route. */
    let generation = 0;

    function query(cursor: string | null = null): PatientListQuery {
      return {
        q: store.effectiveQuery(),
        archived: store.archived(),
        tag: store.tag(),
        sort: apiSort(store.sort()),
        cursor,
      };
    }

    /**
     * Résumés des ACTIVITY_LIMIT premiers patients de la page (ordre de l'API), ACTIVITY_CONCURRENCY
     * à la fois. `force` relit aussi ceux déjà lus (après une relecture de la liste : on relit les
     * projections, on ne garde pas un résumé d'avant une écriture). Les patients sortis de la page
     * perdent leur résumé.
     */
    async function enrich(force: boolean): Promise<void> {
      const ticket = ++generation;
      const ids = store
        .items()
        .slice(0, ACTIVITY_LIMIT)
        .map((patient) => patient.id);
      const previous = store.activity();
      const next: Record<string, ActivityCell> = {};
      const todo: string[] = [];
      for (const id of ids) {
        const cell = previous[id];
        if (cell && !force && cell.status === 'loaded') {
          next[id] = cell;
        } else {
          next[id] = loading(cell);
          todo.push(id);
        }
      }
      patchState(store, { activity: next });
      const worker = async (): Promise<void> => {
        for (let id = todo.shift(); id !== undefined; id = todo.shift()) {
          let cell: ActivityCell;
          try {
            cell = loaded(await api.activity(id));
          } catch (error) {
            cell = failed(asProblem(error), store.activity()[id]);
          }
          if (ticket !== generation) return;
          patchState(store, { activity: { ...store.activity(), [id]: cell } });
        }
      };
      await Promise.all(Array.from({ length: ACTIVITY_CONCURRENCY }, worker));
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
        if (ticket !== request) return;
        patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
        return;
      }
      // Les résumés arrivent après la liste : elle s'affiche sans les attendre.
      void enrich(true);
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

      /** Change le tri ; ne relit la page que si le paramètre envoyé à l'API change. */
      async setSort(sort: PatientSort): Promise<void> {
        if (sort === store.sort()) return;
        const before = apiSort(store.sort());
        patchState(store, { sort });
        writeSort(sort);
        if (apiSort(sort) !== before) await reload();
      },

      /** Filtre rapide : appliqué à la page lue, sans requête. */
      setQuick(quick: QuickFilter): void {
        patchState(store, { quick });
      },

      /** « Réessayer » des résumés en échec (ceux déjà lus restent). */
      async retryActivity(): Promise<void> {
        await enrich(false);
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
        patchState(store, { query: '', tag: null, archived: false, quick: 'all' });
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
          void enrich(false);
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
