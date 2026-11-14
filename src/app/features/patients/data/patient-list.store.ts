import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { CursorPage, failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { PatientApi } from './patient.api';
import {
  apiSort,
  DEFAULT_SORT,
  hasFlags,
  isDemoPatient,
  PATIENT_SORTS,
  PatientActivity,
  PatientListQuery,
  PatientSort,
  PatientView,
  QuickFilter,
  sortRows,
  todayStatus,
} from './patient.model';

/** Clé du tri mémorisé (fiche 01 : « tri persistant par praticien, localStorage »). */
export const SORT_STORAGE_KEY = 'patients.sort';

/** Le filtre ne part au serveur qu'à partir de 2 caractères (fiche 01). */
export const MIN_QUERY_LENGTH = 2;

/** Préfixe d'un filtre par tag dans le champ (« #sommeil » → paramètre tag du contrat). */
export const TAG_PREFIX = '#';

/** Résumé d'une ligne : chargement, lu, ou en échec (la valeur précédente reste). */
export type ActivityCell = Loadable<PatientActivity>;

/** Ligne de la liste : la fiche (GET /api/patients) et son résumé (GET /overview). */
export interface PatientListRow {
  patient: PatientView;
  cell: ActivityCell | null;
  activity: PatientActivity | null;
}

/** Ligne de la bande « Aujourd'hui » : séance ouverte, ou clôturée aujourd'hui. */
export interface TodayRow extends PatientListRow {
  status: 'open' | 'closed';
  activity: PatientActivity;
}

interface PatientListState {
  /** Texte saisi dans le filtre ; seul effectiveQuery est envoyé. */
  query: string;
  archived: boolean;
  sort: PatientSort;
  /** Filtre rapide (Tous, Aujourd'hui, À surveiller, Brouillons), appliqué à la page affichée. */
  quick: QuickFilter;
  page: Loadable<CursorPage<PatientView>>;
  /** Curseur de la page affichée (null : première page). */
  cursor: string | null;
  /** Curseurs des pages précédentes, la plus ancienne d'abord (« Précédent » dépile). */
  previous: (string | null)[];
  /** Résumés des patients de la page affichée, par identifiant. */
  activity: Record<string, ActivityCell>;
  /** Utilisateur de la session à qui appartiennent filtres et page (remise à zéro sinon). */
  owner: string | null;
  /**
   * Dernière écriture lancée depuis la liste et refusée : retrait de la démo, archivage, ou
   * restauration (toast « Restaurer » de la liste comme de la fiche). Effacée par la relecture
   * suivante et par toute nouvelle écriture.
   */
  actionProblem: ListActionProblem | null;
}

/** Écriture refusée depuis la liste : laquelle, et le problème de l'API. */
export interface ListActionProblem {
  action: 'removeDemo' | 'archive' | 'restore';
  problem: ApiProblem;
}

const initialState: PatientListState = {
  query: '',
  archived: false,
  sort: DEFAULT_SORT,
  quick: 'all',
  page: idle(),
  cursor: null,
  previous: [],
  activity: {},
  owner: null,
  actionProblem: null,
};

export function effectiveQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  return trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '';
}

/**
 * Texte effectif → paramètres q et tag du contrat : « #sommeil » filtre par tag (le filtre q ne
 * porte que sur le nom affiché), tout autre texte par nom.
 */
export function queryParams(text: string): { q: string; tag: string | null } {
  if (text.startsWith(TAG_PREFIX)) {
    const tag = text.slice(TAG_PREFIX.length).trim();
    return { q: '', tag: tag === '' ? null : tag };
  }
  return { q: text, tag: null };
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

/** Clé du cache des résumés : le patient et la version de sa fiche. */
function cacheKey(patient: PatientView): string {
  return `${patient.id}:${patient.currentVersion}`;
}

/**
 * Liste des patients (fiche 01, UX-S7, décisions du 14 novembre 2026) : dix patients par page,
 * « Suivant » suit nextCursor et empile le curseur courant, « Précédent » dépile ; tout changement
 * de recherche, de filtre, de tri ou du mode archivés revient à la première page et vide la pile.
 * Chaque patient de la page reçoit son résumé (GET /overview, les dix en parallèle, après la liste
 * sans la retarder) ; les résumés lus restent en cache par patient et version de fiche le temps de
 * la visite, pour ne pas les relire en revenant en arrière. Le cache est vidé à chaque arrivée sur la
 * liste et après chaque écriture : on relit les projections, on ne garde pas un résumé d'avant.
 * Fourni à la racine : les filtres survivent à l'ouverture d'un dossier, et le toast « Restaurer »
 * (posé après un archivage depuis la fiche) peut relire la liste. Si l'utilisateur de la session a
 * changé depuis le dernier chargement, tout repart de zéro. Une réponse arrivée après une requête
 * plus récente est ignorée.
 */
export const PatientListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    effectiveQuery: computed(() => effectiveQuery(store.query())),
    items: computed(() => store.page().data?.items ?? []),
    hasNext: computed(() => (store.page().data?.nextCursor ?? null) !== null),
    hasPrevious: computed(() => store.previous().length > 0),
    filtered: computed(() => effectiveQuery(store.query()) !== '' || store.archived()),
  })),
  withComputed((store) => ({
    /** La liste tient sur plusieurs pages : filtres rapides et tri client ne portent que sur celle-ci. */
    paged: computed(() => store.hasNext() || store.hasPrevious()),
    /** Toutes les lignes de la page, avec leur résumé, dans l'ordre du tri appliqué. */
    allRows: computed<PatientListRow[]>(() => {
      const activity = store.activity();
      const rows = store.items().map((patient) => {
        const cell = activity[patient.id] ?? null;
        return { patient, cell, activity: cell?.data ?? null };
      });
      return sortRows(rows, store.sort());
    }),
  })),
  withComputed((store) => ({
    /** Nombre de résumés qui n'ont pas pu être lus (avertissement « Réessayer » sous le tableau). */
    activityFailures: computed(
      () => store.allRows().filter((row) => row.cell?.status === 'error').length,
    ),
    /**
     * Bande « Aujourd'hui » : patients de la page dont une séance est ouverte (en tête) ou dont la
     * séance la plus récente a été clôturée aujourd'hui. Vide les jours calmes.
     */
    today: computed<TodayRow[]>(() => {
      const now = new Date();
      const rows = store
        .allRows()
        .map((row) => ({ ...row, status: todayStatus(row.activity, now) }))
        .filter((row): row is TodayRow => row.status !== null);
      return [
        ...rows.filter((row) => row.status === 'open'),
        ...rows.filter((row) => row.status === 'closed'),
      ];
    }),
    /** Lignes affichées : filtre rapide appliqué à la page lue. */
    rows: computed<PatientListRow[]>(() => {
      const now = new Date();
      const rows = store.allRows();
      switch (store.quick()) {
        case 'all':
          return rows;
        case 'watch':
          return rows.filter((row) => hasFlags(row.patient));
        case 'today':
          return rows.filter((row) => todayStatus(row.activity, now) !== null);
        case 'drafts':
          return rows.filter((row) => (row.activity?.drafts ?? 0) > 0);
      }
    }),
    /**
     * Accueil de la première connexion (B3 flux 1, planche 29) : liste sans filtre lue, sur une seule
     * page, et aucun patient en dehors des patients de démonstration (zéro patient compris).
     */
    welcome: computed(() => {
      const data = store.page().data;
      if (!data || store.filtered() || data.nextCursor !== null || store.hasPrevious()) {
        return false;
      }
      return data.items.every((patient) => isDemoPatient(patient));
    }),
  })),
  withMethods((store, api = inject(PatientApi), session = inject(SessionStore)) => {
    let request = 0;
    /** Génération des résumés : une nouvelle page rend caducs ceux encore en route. */
    let generation = 0;
    /** Résumés lus pendant la visite, par patient et version de fiche. */
    const cache = new Map<string, PatientActivity>();

    function query(cursor: string | null): PatientListQuery {
      const { q, tag } = queryParams(store.effectiveQuery());
      return { q, tag, archived: store.archived(), sort: apiSort(store.sort()), cursor };
    }

    /**
     * Résumés de toute la page, en parallèle ; ceux du cache s'affichent tout de suite. `retry`
     * relit seulement ceux en échec (les lus restent).
     */
    async function enrich(retry = false): Promise<void> {
      const ticket = ++generation;
      const previous = store.activity();
      const next: Record<string, ActivityCell> = {};
      const todo: PatientView[] = [];
      for (const patient of store.items()) {
        const cached = cache.get(cacheKey(patient));
        const cell = previous[patient.id];
        if (cached) {
          next[patient.id] = loaded(cached);
        } else if (retry && cell?.status === 'loaded') {
          next[patient.id] = cell;
        } else {
          next[patient.id] = loading(cell);
          todo.push(patient);
        }
      }
      patchState(store, { activity: next });
      await Promise.all(
        todo.map(async (patient) => {
          let cell: ActivityCell;
          try {
            const activity = await api.activity(patient.id);
            cache.set(cacheKey(patient), activity);
            cell = loaded(activity);
          } catch (error) {
            cell = failed(asProblem(error), store.activity()[patient.id]);
          }
          if (ticket !== generation) return;
          patchState(store, { activity: { ...store.activity(), [patient.id]: cell } });
        }),
      );
    }

    /**
     * Lit la page de `cursor` ; la pile et le curseur ne changent qu'une fois la page arrivée (un
     * échec laisse la page affichée, avec son bandeau).
     */
    async function fetchPage(cursor: string | null, previous: (string | null)[]): Promise<boolean> {
      const ticket = ++request;
      patchState(store, { page: loading(store.page()), actionProblem: null });
      try {
        const page = await api.list(query(cursor));
        if (ticket !== request) return false;
        patchState(store, { page: loaded(page), cursor, previous });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
        return false;
      }
      // Les résumés arrivent après la liste : elle s'affiche sans les attendre.
      void enrich();
      return true;
    }

    /** Première page, pile vidée (recherche, filtre, tri, mode archivés). */
    async function firstPage(): Promise<void> {
      await fetchPage(null, []);
    }

    /**
     * Relit la page affichée, résumés compris (après une écriture : les projections ont pu changer).
     * Si elle est devenue vide et qu'une page précédente existe, recule d'une page.
     */
    async function reload(): Promise<void> {
      cache.clear();
      const ok = await fetchPage(store.cursor(), store.previous());
      if (ok && store.items().length === 0 && store.hasPrevious()) {
        const stack = store.previous();
        await fetchPage(stack[stack.length - 1], stack.slice(0, -1));
      }
    }

    return {
      /** Arrivée sur la liste : tri mémorisé, cache vidé, première page. */
      async load(): Promise<void> {
        const owner = session.me()?.id ?? null;
        if (owner !== store.owner()) patchState(store, { ...initialState, owner });
        const sort = readSort();
        if (sort) patchState(store, { sort });
        cache.clear();
        await firstPage();
      },

      reload,

      /** « Suivant » : page de nextCursor, le curseur courant est empilé. */
      async next(): Promise<void> {
        const nextCursor = store.page().data?.nextCursor ?? null;
        if (nextCursor === null || store.page().status === 'loading') return;
        await fetchPage(nextCursor, [...store.previous(), store.cursor()]);
      },

      /** « Précédent » : le dernier curseur empilé est dépilé. */
      async previousPage(): Promise<void> {
        const stack = store.previous();
        if (stack.length === 0 || store.page().status === 'loading') return;
        await fetchPage(stack[stack.length - 1], stack.slice(0, -1));
      },

      /** Filtre saisi ; ne relit que si le texte effectif (≥ 2 caractères) change. */
      async setQuery(text: string): Promise<void> {
        const before = store.effectiveQuery();
        patchState(store, { query: text });
        if (store.effectiveQuery() !== before) await firstPage();
      },

      /** Change le tri (mémorisé) ; revient à la première page. */
      async setSort(sort: PatientSort): Promise<void> {
        if (sort === store.sort()) return;
        patchState(store, { sort });
        writeSort(sort);
        await firstPage();
      },

      /** Filtre rapide : appliqué à la page affichée ; revient à la première page s'il y en a une avant. */
      async setQuick(quick: QuickFilter): Promise<void> {
        if (quick === store.quick()) return;
        patchState(store, { quick });
        if (store.hasPrevious()) await firstPage();
      },

      /** « Réessayer » des résumés en échec (ceux déjà lus restent). */
      async retryActivity(): Promise<void> {
        await enrich(true);
      },

      /** « Afficher les archivés » / « Revenir aux actifs ». */
      async setArchived(archived: boolean): Promise<void> {
        if (archived === store.archived()) return;
        patchState(store, { archived, quick: 'all' });
        await firstPage();
      },

      /** « Effacer les filtres » de l'état vide. */
      async clearFilters(): Promise<void> {
        patchState(store, { query: '', archived: false, quick: 'all' });
        await firstPage();
      },

      /**
       * « Archiver » (menu d'une ligne) : DELETE /api/patients/{id} (archivage logique, restaurable),
       * puis relecture de la page affichée. false si l'API refuse.
       */
      async archive(id: string): Promise<boolean> {
        patchState(store, { actionProblem: null });
        try {
          await api.archive(id);
        } catch (error) {
          patchState(store, { actionProblem: { action: 'archive', problem: asProblem(error) } });
          return false;
        }
        await reload();
        return true;
      },

      /** « Supprimer la démo » : même archivage, message d'échec propre à la démo. */
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
       * POST /restore puis relecture de la page affichée.
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
