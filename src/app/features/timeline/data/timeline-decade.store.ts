import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import {
  DecadePeriod,
  DecadeRange,
  DecadeSnapshot,
  DecadeStatus,
  DecadeView,
  decidedWithoutSummary,
  decideView,
  NO_RANGE,
  plageOf,
  sameRange,
  TimelinePeriod,
} from './timeline-decade.model';
import { localDay } from './timeline-filters.model';
import { TimelineFiltersStore } from './timeline-filters.store';
import { TimelineApi } from './timeline.api';
import { TimelineStore } from './timeline.store';

interface DecadeState {
  patientId: string | null;
  status: DecadeStatus;
  problem: ApiProblem | null;
  /** Mois non vides du résumé, du plus ancien au plus récent. */
  periods: TimelinePeriod[];
  /** Fenêtre à laquelle `periods` répond (bornes de période des filtres). */
  range: DecadeRange;
  /** Choix explicite (zoom − au-delà du mois, + depuis l'agrégat), oublié quand la plage change. */
  manual: DecadeView | null;
  /**
   * Période d'avant le double-clic sur un mois : `Échap` y revient, et tant qu'elle est là, le
   * détail l'emporte sur l'agrégat forcé. Seule source du « mois ouvert ».
   */
  drillBack: DecadePeriod | null;
}

const initialState: DecadeState = {
  patientId: null,
  status: 'idle',
  problem: null,
  periods: [],
  range: NO_RANGE,
  manual: null,
  drillBack: null,
};

/**
 * Vue décennie de la timeline (fiche 03, état C ; A6 ; M3-04) : le résumé mensuel du dossier
 * (GET …/timeline/summary?granularity=month, calculé par le serveur, < 100 ms) et la vue qui en
 * découle. La bascule est dérivée, jamais copiée : `view` vaut l'agrégat dès que la plage dépasse
 * 3 ans (ou que la préférence `timeline.groupBy = month` le force) et revient au détail dès qu'elle
 * repasse en deçà, sauf choix explicite au zoom ou mois ouvert. Le résumé n'est demandé qu'en mode
 * chronologique (l'état C n'existe pas par séance), relu à chaque changement de période et après une
 * écriture ; les autres filtres ne le changent pas (le contrat ne les connaît pas). Le début du suivi
 * vient du TimelineStore (une seule source).
 */
export const TimelineDecadeStore = signalStore(
  withState(initialState),
  withComputed(
    (store, filters = inject(TimelineFiltersStore), timeline = inject(TimelineStore)) => {
      const plage = computed(() => {
        const range = store.range();
        if (store.status() === 'loaded') {
          return plageOf(range, store.periods(), timeline.followStart());
        }
        // Période des filtres bornée des deux côtés : la plage est connue sans le résumé.
        return range.fromDay && range.toDay ? plageOf(range, [], null) : null;
      });
      const drilled = computed(() => store.drillBack() !== null);
      return {
        plage,
        drilled,
        /** Détail ou agrégat ; toujours le détail en mode par séance (l'état C est chronologique). */
        view: computed<DecadeView>(() =>
          filters.mode() !== 'chronological'
            ? 'detail'
            : decideView({
                manual: store.manual(),
                drilled: drilled(),
                forced: filters.forcedDecade(),
                plage: plage(),
              }),
        ),
        /**
         * La vue peut être décidée sans changer ensuite : le résumé a répondu (ou échoué), ou la
         * période des filtres suffit (bornée, ou commencée il y a moins de 3 ans).
         */
        settled: computed(
          () =>
            store.status() === 'loaded' ||
            store.status() === 'error' ||
            decidedWithoutSummary(store.range(), localDay(new Date())),
        ),
      };
    },
  ),
  withMethods((store, api = inject(TimelineApi), filters = inject(TimelineFiltersStore)) => {
    /** Change à chaque demande : une réponse d'une demande passée est ignorée. */
    let generation = 0;

    function chronological(): boolean {
      return filters.mode() !== 'session';
    }

    function currentRange(): DecadeRange {
      const query = filters.query();
      const days = filters.filters();
      return { from: query.from, to: query.to, fromDay: days.from, toDay: days.to };
    }

    /** Lit le résumé de la fenêtre ; `quiet` garde ce qui est affiché si la relecture échoue. */
    async function fetchSummary(quiet = false): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      const gen = ++generation;
      const range = store.range();
      if (!quiet) patchState(store, { status: 'loading', problem: null });
      try {
        const periods = await api.summary(id, range);
        if (gen !== generation) return;
        patchState(store, { status: 'loaded', problem: null, periods });
      } catch (error) {
        if (gen !== generation) return;
        if (quiet && store.status() === 'loaded') return;
        patchState(store, { status: 'error', problem: asProblem(error) });
      }
    }

    /** En mode par séance, rien n'est demandé : le résumé se lit au passage en chronologique. */
    function fetchOrWait(): Promise<void> {
      if (chronological()) return fetchSummary();
      generation++;
      patchState(store, { status: 'idle', problem: null });
      return Promise.resolve();
    }

    return {
      /**
       * Ouvre la vue sur le patient, pour la période des filtres. Avec l'état rangé au départ
       * précédent (même période), il est repris tel quel puis relu en arrière-plan.
       */
      async open(patientId: string, snapshot?: DecadeSnapshot | null): Promise<void> {
        const range = currentRange();
        if (snapshot && sameRange(snapshot.range, range)) {
          generation++;
          patchState(store, {
            ...initialState,
            patientId,
            status: chronological() ? 'loaded' : 'idle',
            periods: snapshot.periods,
            range,
            manual: snapshot.manual,
            drillBack: snapshot.drillBack,
          });
          if (chronological()) await fetchSummary(true);
          return;
        }
        patchState(store, { ...initialState, patientId, range });
        await fetchOrWait();
      },

      /**
       * Les filtres ont changé. Si leur période change, le résumé est relu et le choix explicite
       * tombe : la bascule redevient automatique.
       */
      async syncRange(): Promise<void> {
        if (!store.patientId()) return;
        const range = currentRange();
        if (sameRange(range, store.range()) && store.status() !== 'error') return;
        patchState(store, { range, manual: null });
        await fetchOrWait();
      },

      /** Double-clic sur un mois : la période d'avant est gardée (la plus ancienne, pour `Échap`). */
      markDrill(previous: DecadePeriod): void {
        if (!store.drillBack()) patchState(store, { drillBack: previous });
      },

      /** `Échap`, ou période changée à la main : plus de mois ouvert. */
      forgetDrill(): void {
        if (store.drillBack()) patchState(store, { drillBack: null });
      },

      /** Zoom − au-delà du mois : l'agrégat, jusqu'au prochain changement de période. */
      showDecade(): void {
        patchState(store, { manual: 'decade' });
        if (store.status() === 'idle') void fetchSummary();
      },

      /** Zoom + depuis l'agrégat (ou `?focus=`) : le détail, jusqu'au prochain changement de période. */
      showDetail(): void {
        patchState(store, { manual: 'detail' });
      },

      /** Réessayer après l'échec du résumé (et première lecture au passage en chronologique). */
      retrySummary(): Promise<void> {
        return fetchSummary();
      },

      /** Relit le résumé après une écriture, sans vider l'écran ni changer de vue. */
      rereadSummary(): Promise<void> {
        if (store.status() !== 'loaded') return Promise.resolve();
        if (!chronological()) {
          // Par séance : relu au prochain passage en chronologique.
          generation++;
          patchState(store, { status: 'idle' });
          return Promise.resolve();
        }
        return fetchSummary(true);
      },

      /** L'état à ranger dans le shell (rememberTab). */
      snapshot(): DecadeSnapshot | null {
        if (store.status() !== 'loaded') return null;
        return {
          periods: store.periods(),
          range: store.range(),
          manual: store.manual(),
          drillBack: store.drillBack(),
        };
      },
    };
  }),
  withHooks({
    onInit(store) {
      const filters = inject(TimelineFiltersStore);
      // Passage en chronologique (bouton, M, préférence) : le résumé attendu est lu.
      effect(() => {
        if (filters.mode() === 'session' || store.status() !== 'idle' || !store.patientId()) return;
        untracked(() => void store.retrySummary());
      });
    },
  }),
);

export type TimelineDecadeStore = InstanceType<typeof TimelineDecadeStore>;
