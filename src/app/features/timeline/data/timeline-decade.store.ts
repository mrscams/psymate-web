import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import {
  DecadeRange,
  DecadeSnapshot,
  DecadeView,
  decideView,
  NO_RANGE,
  plageOf,
  sameRange,
  TimelinePeriod,
} from './timeline-decade.model';
import { TimelineFiltersStore } from './timeline-filters.store';
import { TimelineApi } from './timeline.api';

/** idle | loading (résumé demandé) | loaded | error (résumé en échec). */
export type DecadeStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface DecadeState {
  patientId: string | null;
  /** Début du suivi (en-tête patient), pour le début clinique de la plage. */
  followedSince: string | null;
  status: DecadeStatus;
  problem: ApiProblem | null;
  /** Mois non vides du résumé, du plus ancien au plus récent. */
  periods: TimelinePeriod[];
  /** Fenêtre à laquelle `periods` répond (bornes de période des filtres). */
  range: DecadeRange;
  /** Choix explicite (zoom − au-delà du mois, + depuis l'agrégat), oublié quand la plage change. */
  manual: DecadeView | null;
  /** La plage vient d'un double-clic sur un mois : le détail l'emporte sur l'agrégat forcé. */
  drilled: boolean;
}

const initialState: DecadeState = {
  patientId: null,
  followedSince: null,
  status: 'idle',
  problem: null,
  periods: [],
  range: NO_RANGE,
  manual: null,
  drilled: false,
};

/**
 * Vue décennie de la timeline (fiche 03, état C ; A6 ; M3-04) : le résumé mensuel du dossier
 * (GET …/timeline/summary?granularity=month, calculé par le serveur, < 100 ms) et la vue qui en
 * découle. La bascule est dérivée, jamais copiée : `view` vaut l'agrégat dès que la plage dépasse
 * 3 ans (ou que la préférence `timeline.groupBy = month` le force) et revient au détail dès qu'elle
 * repasse en deçà, sauf choix explicite au zoom. Le résumé est relu à chaque changement de période
 * et après une écriture ; les autres filtres ne le changent pas (le contrat ne les connaît pas).
 */
export const TimelineDecadeStore = signalStore(
  withState(initialState),
  withComputed((store, filters = inject(TimelineFiltersStore)) => {
    const plage = computed(() =>
      store.status() === 'loaded'
        ? plageOf(store.range(), store.periods(), store.followedSince())
        : null,
    );
    return {
      plage,
      /** Détail ou agrégat ; toujours le détail en mode par séance (l'état C est chronologique). */
      view: computed<DecadeView>(() =>
        filters.mode() !== 'chronological'
          ? 'detail'
          : decideView({
              manual: store.manual(),
              drilled: store.drilled(),
              forced: filters.forcedDecade(),
              plage: plage(),
            }),
      ),
      /** Le résumé a répondu (ou échoué) : la vue peut être décidée sans changer ensuite. */
      settled: computed(() => store.status() === 'loaded' || store.status() === 'error'),
    };
  }),
  withMethods((store, api = inject(TimelineApi), filters = inject(TimelineFiltersStore)) => {
    /** Change à chaque demande : une réponse d'une demande passée est ignorée. */
    let generation = 0;

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

    return {
      /**
       * Ouvre la vue sur le patient, pour la période des filtres. Avec l'état rangé au départ
       * précédent (même période), il est repris tel quel puis relu en arrière-plan.
       */
      async open(
        patientId: string,
        followedSince: string | null,
        snapshot?: DecadeSnapshot | null,
      ): Promise<void> {
        const range = currentRange();
        if (snapshot && sameRange(snapshot.range, range)) {
          patchState(store, {
            ...initialState,
            patientId,
            followedSince,
            status: 'loaded',
            periods: snapshot.periods,
            range,
            manual: snapshot.manual,
            drilled: snapshot.drilled,
          });
          await fetchSummary(true);
          return;
        }
        patchState(store, {
          ...initialState,
          patientId,
          followedSince,
          range,
        });
        await fetchSummary();
      },

      /**
       * Les filtres ont changé. Si leur période change, le résumé est relu et le choix explicite
       * tombe : la bascule redevient automatique. `drilled` dit si la période vient d'un
       * double-clic sur un mois.
       */
      async syncRange(drilled: boolean): Promise<void> {
        if (!store.patientId()) return;
        const range = currentRange();
        if (sameRange(range, store.range()) && store.status() !== 'error') {
          if (drilled !== store.drilled()) patchState(store, { drilled });
          return;
        }
        patchState(store, { range, manual: null, drilled });
        await fetchSummary();
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

      /** Réessayer après l'échec du résumé. */
      retrySummary(): Promise<void> {
        return fetchSummary();
      },

      /** Relit le résumé après une écriture, sans vider l'écran ni changer de vue. */
      rereadSummary(): Promise<void> {
        return fetchSummary(true);
      },

      /** L'état à ranger dans le shell (rememberTab), sans les filtres d'avant le double-clic. */
      snapshot(): Omit<DecadeSnapshot, 'drillBack'> | null {
        if (store.status() !== 'loaded') return null;
        return {
          periods: store.periods(),
          range: store.range(),
          manual: store.manual(),
          drilled: store.drilled(),
        };
      },
    };
  }),
);

export type TimelineDecadeStore = InstanceType<typeof TimelineDecadeStore>;
