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
import { AccountItem, JournalItem, JournalQuery } from './admin.model';

/**
 * Segments de type (fiche 22) traduits en filtre `kind` du contrat (égalité ou préfixe pointé) :
 * actes d'administration (admin.*), ouvertures de justificatifs, recours, annuaire.
 */
export const JOURNAL_CATEGORIES = {
  all: null,
  admin: 'admin',
  documents: 'admin.document_read',
  appeals: 'appeal',
  directory: 'directory',
} as const;
export type JournalCategory = keyof typeof JOURNAL_CATEGORIES;

export const JOURNAL_PERIODS = ['7d', '30d', 'all', 'custom'] as const;
export type JournalPeriod = (typeof JOURNAL_PERIODS)[number];

/** Filtres du journal, tels qu'ils sont dans l'URL (fiche 22 : filtres dans l'URL, combinables). */
export interface JournalFilters {
  category: JournalCategory;
  actorId: string | null;
  practitionerId: string | null;
  period: JournalPeriod;
  /** Jours AAAA-MM-JJ de la période personnalisée. */
  from: string | null;
  to: string | null;
}

export const DEFAULT_JOURNAL_FILTERS: JournalFilters = {
  category: 'all',
  actorId: null,
  practitionerId: null,
  period: '7d',
  from: null,
  to: null,
};

/** Bornes envoyées au serveur : 7 ou 30 derniers jours (instant UTC), ou les jours choisis. */
export function periodRange(
  filters: JournalFilters,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  switch (filters.period) {
    case '7d':
    case '30d': {
      const days = filters.period === '7d' ? 7 : 30;
      return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: null };
    }
    case 'custom':
      return { from: filters.from, to: filters.to };
    default:
      return { from: null, to: null };
  }
}

function sameFilters(a: JournalFilters, b: JournalFilters): boolean {
  return (
    a.category === b.category &&
    a.actorId === b.actorId &&
    a.practitionerId === b.practitionerId &&
    a.period === b.period &&
    a.from === b.from &&
    a.to === b.to
  );
}

interface JournalState {
  filters: JournalFilters;
  page: Loadable<CursorPage<JournalItem>>;
  loadingMore: boolean;
  moreProblem: ApiProblem | null;
  /** Administrateurs, pour le filtre « Par ». */
  admins: Loadable<AccountItem[]>;
}

const initialState: JournalState = {
  filters: DEFAULT_JOURNAL_FILTERS,
  page: idle(),
  loadingMore: false,
  moreProblem: null,
  admins: idle(),
};

/**
 * Journal d'administration (fiche 22) : lecture seule, du plus récent au plus ancien, filtres
 * cumulables, « Afficher plus » par curseur. Fourni par la page.
 */
export const JournalStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    items: computed(() => store.page().data?.items ?? []),
    hasMore: computed(() => (store.page().data?.nextCursor ?? null) !== null),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;
    /** Bornes de la période figées au chargement de la première page (le curseur les suppose). */
    let range: { from: string | null; to: string | null } = { from: null, to: null };

    function query(cursor: string | null): JournalQuery {
      const filters = store.filters();
      return {
        kind: JOURNAL_CATEGORIES[filters.category],
        actorId: filters.actorId,
        practitionerId: filters.practitionerId,
        from: range.from,
        to: range.to,
        cursor,
      };
    }

    async function reload(): Promise<void> {
      const ticket = ++request;
      range = periodRange(store.filters());
      patchState(store, { page: loading(store.page()), loadingMore: false, moreProblem: null });
      try {
        const page = await api.journal(query(null));
        if (ticket === request) patchState(store, { page: loaded(page) });
      } catch (error) {
        if (ticket === request) patchState(store, { page: failed(asProblem(error), store.page()) });
      }
    }

    return {
      reload,

      async setFilters(filters: JournalFilters): Promise<void> {
        if (sameFilters(filters, store.filters()) && store.page().status !== 'idle') return;
        patchState(store, { filters });
        await reload();
      },

      /** « Afficher plus » ; renvoie le nombre de lignes ajoutées (la page y place le focus). */
      async loadMore(): Promise<number> {
        const current = store.page().data;
        if (!current?.nextCursor || store.loadingMore()) return 0;
        const ticket = request;
        patchState(store, { loadingMore: true, moreProblem: null });
        try {
          const next = await api.journal(query(current.nextCursor));
          if (ticket !== request) return 0;
          const merged = appendPage(current, next, (item) => item.id);
          patchState(store, { page: loaded(merged), loadingMore: false });
          return merged.items.length - current.items.length;
        } catch (error) {
          if (ticket === request) {
            patchState(store, { loadingMore: false, moreProblem: asProblem(error) });
          }
          return 0;
        }
      },

      /** Administrateurs (GET /api/admin/practitioners?role=admin), une fois par page. */
      async loadAdmins(): Promise<void> {
        if (store.admins().status === 'loaded' || store.admins().status === 'loading') return;
        patchState(store, { admins: loading(store.admins()) });
        try {
          const page = await api.accounts({
            q: '',
            status: null,
            role: 'admin',
            profession: null,
            cursor: null,
            limit: 200,
          });
          patchState(store, { admins: loaded(page.items) });
        } catch (error) {
          patchState(store, { admins: failed(asProblem(error), store.admins()) });
        }
      },
    };
  }),
);
