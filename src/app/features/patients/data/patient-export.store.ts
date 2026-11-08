import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { ExportedFile, PatientExportApi, PatientExportFormat } from './patient-export.api';

interface PatientExportState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
}

/**
 * État du menu « Exporter ce dossier » (fiche 16, état C de la fiche 19), fourni par le composant :
 * téléchargement direct, sans job ni historique.
 */
export const PatientExportStore = signalStore(
  withState<PatientExportState>({ status: 'idle', problem: null }),
  withMethods((store, api = inject(PatientExportApi)) => ({
    /** Le fichier, rendu au composant qui l'enregistre ; null en cas d'erreur (`problem`). */
    async exportFile(id: string, format: PatientExportFormat): Promise<ExportedFile | null> {
      patchState(store, { status: 'busy', problem: null });
      try {
        const file = await api.exportPatient(id, format);
        patchState(store, { status: 'idle' });
        return file;
      } catch (error) {
        patchState(store, { status: 'error', problem: asProblem(error) });
        return null;
      }
    },
  })),
);
