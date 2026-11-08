import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { TimelineApi } from './timeline.api';
import { SessionDetailState } from './timeline-sessions.model';

interface TimelineSessionState {
  /** Détail des séances dépliées, par identifiant (GET /api/entries/{id}). */
  details: Record<string, SessionDetailState>;
}

/**
 * Détail des séances du mode par séance (fiche 03, état B ; M3-03) : horaires, durée, modalité,
 * statut et compte rendu, lus à la demande quand une séance se déplie, une fois par séance. Le
 * regroupement lui-même vient des fenêtres du TimelineStore (une seule lecture de la chronologie).
 */
export const TimelineSessionStore = signalStore(
  withState<TimelineSessionState>({ details: {} }),
  withMethods((store, api = inject(TimelineApi)) => {
    /** Change à chaque remise à zéro : une réponse d'avant est ignorée. */
    let generation = 0;

    function put(id: string, state: SessionDetailState): void {
      patchState(store, { details: { ...store.details(), [id]: state } });
    }

    async function fetch(id: string): Promise<void> {
      const gen = generation;
      const previous = store.details()[id];
      put(id, { status: 'loading', detail: previous?.detail ?? null, problem: null });
      try {
        const detail = await api.sessionDetail(id);
        if (gen === generation) put(id, { status: 'loaded', detail, problem: null });
      } catch (error) {
        if (gen === generation)
          put(id, { status: 'error', detail: null, problem: asProblem(error) });
      }
    }

    return {
      /** Lit le détail d'une séance qui se déplie (rien si déjà lu ou en cours). */
      load(id: string): Promise<void> {
        const current = store.details()[id];
        if (current && current.status !== 'error') return Promise.resolve();
        return fetch(id);
      },

      /** Réessayer après un échec. */
      retry(id: string): Promise<void> {
        return fetch(id);
      },

      /** Après une écriture : les détails déjà lus sont relus (on relit, on ne recalcule pas). */
      async refresh(): Promise<void> {
        await Promise.all(Object.keys(store.details()).map((id) => fetch(id)));
      },

      /** Autre patient : rien ne survit. */
      reset(): void {
        generation++;
        patchState(store, { details: {} });
      },
    };
  }),
);

export type TimelineSessionStore = InstanceType<typeof TimelineSessionStore>;
