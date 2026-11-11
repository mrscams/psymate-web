import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import {
  defaultFilters,
  defaultPreset,
  filterParams,
  filterQuery,
  hasFilterParams,
  hasFilters,
  hasNarrowing,
  modeOfGroupBy,
  NO_FILTERS,
  ParamSource,
  parseFilters,
  parseMode,
  TimelineFilters,
  TimelineFiltersSnapshot,
  TimelineMode,
  sameFilters,
} from './timeline-filters.model';

interface TimelineFiltersState {
  filters: TimelineFilters;
  /**
   * Mode imposé pour cet écran : `?mode=` de l'URL (fiche 03 : il l'emporte sur la préférence,
   * sans l'écrire), ou le mode choisi quand l'écriture de la préférence a échoué. Null : le mode
   * suit la préférence `timeline.groupBy`.
   */
  modeOverride: TimelineMode | null;
  /**
   * Mode de cette visite seulement (`?focus=` hors des séances regroupées → chronologique) : ni
   * dans l'URL, ni dans la mémoire de l'onglet ; il tombe à la prochaine ouverture ou bascule.
   */
  visitMode: TimelineMode | null;
  /**
   * Filtres de l'arrivée (UX-B2) : la période par défaut (90 j, ou `overview.window`), fixée à
   * l'entrée sur l'onglet. Elle n'est pas écrite dans l'URL ; « Tout » s'y écrit `?period=all`.
   * Élargie à « Tout » pour la visite quand elle ne montre rien ou exclut l'entrée demandée.
   */
  defaults: TimelineFilters;
}

const initialState: TimelineFiltersState = {
  filters: NO_FILTERS,
  modeOverride: null,
  visitMode: null,
  defaults: NO_FILTERS,
};

/**
 * Filtres et mode de la timeline (fiche 03, M3-03). Une seule source pendant la vie de l'onglet :
 * ce store. L'URL n'est lue qu'à l'entrée (`init`, avant la mémoire de l'onglet), puis la page la
 * réécrit depuis `params()` à chaque changement (replaceUrl) : un seul sens de synchronisation,
 * store → URL. Le mode vient de la préférence `timeline.groupBy` (PreferencesStore, relue à chaque
 * ouverture, sur n'importe quel patient), sauf `?mode=` ; la bascule écrit la préférence.
 */
export const TimelineFiltersStore = signalStore(
  withState(initialState),
  withComputed((store, prefs = inject(PreferencesStore)) => ({
    mode: computed<TimelineMode>(
      () => store.visitMode() ?? store.modeOverride() ?? modeOfGroupBy(prefs.timelineGroupBy()),
    ),
    /**
     * Préférence `timeline.groupBy = month` (fiche 03 : état C forcé) : la vue décennie s'affiche
     * même sur une plage courte, tant qu'aucun mode n'est imposé (URL, visite, échec d'écriture).
     */
    forcedDecade: computed(
      () =>
        store.visitMode() === null &&
        store.modeOverride() === null &&
        prefs.timelineGroupBy() === 'month',
    ),
    /** Au moins un filtre posé, période comprise (« Effacer les filtres » dans l'état vide). */
    active: computed(() => hasFilters(store.filters())),
    /** Un filtre autre que la période : type, émotion, tag, brouillons. */
    narrowed: computed(() => hasNarrowing(store.filters())),
    /** Les filtres sont ceux de l'arrivée (période par défaut, rien d'autre). */
    atDefaults: computed(() => sameFilters(store.filters(), store.defaults())),
    /** Paramètres d'URL à jour (une valeur par défaut retire le paramètre). */
    params: computed(() => filterParams(store.filters(), store.modeOverride(), store.defaults())),
    /** Paramètres de la requête GET …/timeline. */
    query: computed(() => filterQuery(store.filters())),
  })),
  withMethods((store, prefs = inject(PreferencesStore)) => ({
    /**
     * Entrée sur l'onglet : l'URL l'emporte si elle porte un filtre ou un mode (lien partagé,
     * rechargement), sinon la mémoire de l'onglet, sinon les filtres de l'arrivée (période par
     * défaut, UX-B2). Renvoie la source retenue.
     */
    init(
      url: ParamSource,
      recalled?: TimelineFiltersSnapshot | null,
      today: Date = new Date(),
    ): 'url' | 'memory' | 'none' {
      const defaults =
        recalled?.defaults ??
        defaultFilters(defaultPreset(prefs.overviewWindow(), prefs.timelineGroupBy()), today);
      if (hasFilterParams(url)) {
        patchState(store, {
          filters: parseFilters(url),
          modeOverride: parseMode(url),
          visitMode: null,
          defaults,
        });
        return 'url';
      }
      if (recalled) {
        patchState(store, {
          filters: { ...NO_FILTERS, ...recalled.filters },
          modeOverride: recalled.modeOverride ?? null,
          visitMode: null,
          defaults,
        });
        return 'memory';
      }
      patchState(store, { ...initialState, filters: defaults, defaults });
      return 'none';
    },

    /**
     * Les filtres de l'arrivée ne montrent rien, ou excluent l'entrée demandée (`?focus=`) : la
     * période passe à « Tout » pour cette visite, sans rien écrire dans l'URL (le défaut devient
     * « Tout »). Faux si les filtres ne sont pas ceux de l'arrivée ou si le défaut est déjà « Tout ».
     */
    widenDefaults(): boolean {
      if (!sameFilters(store.filters(), store.defaults()) || !hasFilters(store.defaults()))
        return false;
      patchState(store, { filters: NO_FILTERS, defaults: NO_FILTERS });
      return true;
    },

    set(filters: TimelineFilters): void {
      patchState(store, { filters });
    },

    clear(): void {
      patchState(store, { filters: NO_FILTERS });
    },

    /**
     * Bascule Chronologique | Par séance (bouton, touche M) : la préférence est écrite (optimiste,
     * PATCH /api/me/preferences) et le mode imposé par l'URL tombe. Si l'écriture échoue, le mode
     * choisi reste sur cet écran et l'ApiProblem est renvoyé (la page prévient).
     */
    async setMode(mode: TimelineMode): Promise<ApiProblem | null> {
      patchState(store, { modeOverride: null, visitMode: null });
      const problem = await prefs.set('timeline.groupBy', mode);
      if (problem) patchState(store, { modeOverride: mode });
      return problem;
    },

    /**
     * Impose un mode pour cette visite seulement, sans écrire la préférence ni l'URL ni la mémoire
     * de l'onglet (`?focus=` sur une entrée hors des séances regroupées).
     */
    overrideForVisit(mode: TimelineMode): void {
      patchState(store, { visitMode: mode });
    },

    snapshot(): TimelineFiltersSnapshot {
      return {
        filters: store.filters(),
        modeOverride: store.modeOverride(),
        defaults: store.defaults(),
      };
    },
  })),
);

export type TimelineFiltersStore = InstanceType<typeof TimelineFiltersStore>;
