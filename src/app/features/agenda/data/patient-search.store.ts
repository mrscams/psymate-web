import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AgendaApi } from './agenda.api';
import { PatientOption } from './agenda.model';

interface PatientSearchState {
  /** Résultats de la recherche de patient (idle tant que rien n'est tapé). */
  results: Loadable<PatientOption[]>;
}

const initialState: PatientSearchState = { results: idle() };

/**
 * Recherche des patients actifs (`GET /api/patients?q=&archived=false`) du sélecteur de patient
 * (`pm-patient-picker`), qui la fournit : panneau « Nouveau rendez-vous » (fiche 15b) et
 * « Rattacher à un patient » du détail (fiche 15, M14-15). Une réponse dépassée par une recherche
 * plus récente est ignorée.
 */
export const PatientSearchStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(AgendaApi)) => {
    let ticket = 0;
    return {
      async search(query: string): Promise<void> {
        const current = ++ticket;
        if (!query.trim()) {
          patchState(store, { results: idle() });
          return;
        }
        patchState(store, { results: loading(store.results()) });
        try {
          const results = await api.searchPatients(query);
          if (current === ticket) patchState(store, { results: loaded(results) });
        } catch (error) {
          if (current === ticket) patchState(store, { results: failed(asProblem(error)) });
        }
      },
      clear(): void {
        ticket++;
        patchState(store, { results: idle() });
      },
    };
  }),
);
