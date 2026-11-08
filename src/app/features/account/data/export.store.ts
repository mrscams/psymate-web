import { DOCUMENT } from '@angular/common';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import {
  DataExportApi,
  DownloadedFile,
  ExportStatus,
  PatientExportFormat,
  PatientOption,
} from './data-export.api';

/**
 * Clé localStorage du dernier export de compte (fiche 19 : `lastJobId` conservé côté client). Seul
 * l'identifiant du job y est écrit, avec celui du compte qui l'a lancé : aucune donnée clinique, et
 * l'identifiant seul ne donne rien sans la session de son propriétaire (404 sinon).
 */
export const EXPORT_JOB_STORAGE_KEY = 'psymate.account.export';

interface StoredJob {
  jobId: string;
  owner: string | null;
}

interface ActionState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
}

interface ExportState {
  /** Texte cherché dans le sélecteur de patient ; '' = premiers patients par nom. */
  query: string;
  patients: Loadable<PatientOption[]>;
  /** Export d'un patient (téléchargement direct, sans job). */
  patientExport: ActionState;
  /** Dernier job d'export de compte connu (le seul visible en V1, fiche 19 « Écarts »). */
  jobId: string | null;
  job: Loadable<ExportStatus>;
  /** POST /api/me/export. */
  launch: ActionState;
  /** 409 EXPORT_IN_PROGRESS pour un job que ce navigateur ne connaît pas : bouton en attente. */
  conflict: boolean;
  download: { status: 'idle' | 'busy' | 'expired' | 'error'; problem: ApiProblem | null };
}

const ACTION_IDLE: ActionState = { status: 'idle', problem: null };

const initialState: ExportState = {
  query: '',
  patients: idle(),
  patientExport: ACTION_IDLE,
  jobId: null,
  job: idle(),
  launch: ACTION_IDLE,
  conflict: false,
  download: { status: 'idle', problem: null },
};

/** Ce que la ligne « Dernier export » affiche (fiche 19, Interactions). */
export type ExportRowKind = 'none' | 'queued' | 'running' | 'ready' | 'expired' | 'failed';

/**
 * État de « Données et export » (fiche 19), fourni par la page : sélecteur et export d'un patient ;
 * export du compte (job asynchrone, lien 7 jours, 410 ensuite). Le dernier job survit à la page par
 * son identifiant en localStorage : au retour, son état est relu ; un 404 l'oublie.
 */
export const ExportStore = signalStore(
  withState(initialState),
  withComputed(({ job, launch, download, conflict }) => {
    const jobKind = computed<ExportRowKind>(() => {
      const data = job().data;
      if (download().status === 'expired') return 'expired';
      if (!data) return 'none';
      switch (data.status) {
        case 'queued':
          return 'queued';
        case 'running':
          return 'running';
        case 'failed':
          return 'failed';
        case 'done':
          return data.downloadUrl ? 'ready' : 'expired';
      }
    });
    /** Un job est en file ou en cours (ou la demande part) : un seul export à la fois. */
    const jobPending = computed(() => {
      const kind = jobKind();
      return launch().status === 'busy' || kind === 'queued' || kind === 'running';
    });
    return {
      jobKind,
      jobPending,
      /** « Préparer l'export » attend : job en cours, connu ou signalé par un 409. */
      launchBlocked: computed(() => jobPending() || conflict()),
    };
  }),
  withMethods(
    (
      store,
      api = inject(DataExportApi),
      session = inject(SessionStore),
      document = inject(DOCUMENT),
    ) => {
      let searchSeq = 0;

      const storage = (): Storage | null => {
        try {
          return document.defaultView?.localStorage ?? null;
        } catch {
          return null;
        }
      };

      function saveJob(jobId: string | null): void {
        patchState(store, { jobId });
        try {
          if (jobId) {
            const value: StoredJob = { jobId, owner: session.me()?.id ?? null };
            storage()?.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify(value));
          } else {
            storage()?.removeItem(EXPORT_JOB_STORAGE_KEY);
          }
        } catch {
          // Stockage indisponible : le job vit en mémoire le temps de la page.
        }
      }

      /** Le job mémorisé par ce compte ; celui d'un autre compte du navigateur est ignoré. */
      function readJob(): string | null {
        try {
          const raw = storage()?.getItem(EXPORT_JOB_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as Partial<StoredJob>;
          if (typeof parsed.jobId !== 'string' || !parsed.jobId) return null;
          const me = session.me()?.id ?? null;
          return parsed.owner && me && parsed.owner !== me ? null : parsed.jobId;
        } catch {
          return null;
        }
      }

      async function refreshJob(): Promise<void> {
        const jobId = store.jobId();
        if (!jobId) return;
        patchState(store, { job: loading(store.job()) });
        try {
          const status = await api.exportStatus(jobId);
          patchState(store, { job: loaded(status) });
          if (status.status !== 'queued' && status.status !== 'running') {
            patchState(store, { conflict: false });
          }
        } catch (error) {
          const problem = asProblem(error);
          if (problem.status === 404) {
            // Job inconnu (purgé, autre compte) : la ligne disparaît (fiche 19).
            saveJob(null);
            patchState(store, { job: idle() });
            return;
          }
          patchState(store, { job: failed(problem, store.job()) });
        }
      }

      return {
        /** GET /api/patients (actifs puis archivés) filtré par `query` ; la réponse la plus récente gagne. */
        async searchPatients(query: string): Promise<void> {
          const seq = ++searchSeq;
          patchState(store, { query, patients: loading(store.patients()) });
          try {
            const options = await api.searchPatients(query);
            if (seq === searchSeq) patchState(store, { patients: loaded(options) });
          } catch (error) {
            if (seq === searchSeq) {
              patchState(store, { patients: failed(asProblem(error), store.patients()) });
            }
          }
        },

        /**
         * Export d'un patient : le fichier est rendu à la page, qui déclenche l'enregistrement. Null
         * en cas d'erreur (403, 404, 429, 500 dans `patientExport.problem`).
         */
        async exportPatient(
          id: string,
          format: PatientExportFormat,
        ): Promise<DownloadedFile | null> {
          patchState(store, { patientExport: { status: 'busy', problem: null } });
          try {
            const file = await api.exportPatient(id, format);
            patchState(store, { patientExport: ACTION_IDLE });
            return file;
          } catch (error) {
            patchState(store, { patientExport: { status: 'error', problem: asProblem(error) } });
            return null;
          }
        },

        /** Au retour sur la page : reprend le dernier job et réinterroge son état. */
        async restoreJob(): Promise<void> {
          if (!store.jobId()) {
            const jobId = readJob();
            if (!jobId) {
              saveJob(null);
              return;
            }
            patchState(store, { jobId });
          }
          await refreshJob();
        },

        refreshJob,

        /**
         * POST /api/me/export (« Lancer l'export » ou « Relancer ») : vrai quand un job est créé, son
         * suivi démarre. Faux sinon : 409 EXPORT_IN_PROGRESS (job connu relu, sinon `conflict`),
         * autre erreur dans `launch.problem`.
         */
        async launchExport(): Promise<boolean> {
          patchState(store, {
            launch: { status: 'busy', problem: null },
            download: { status: 'idle', problem: null },
          });
          try {
            const jobId = await api.requestExport();
            saveJob(jobId);
            patchState(store, { launch: ACTION_IDLE, conflict: false, job: loading() });
            await refreshJob();
            return true;
          } catch (error) {
            const problem = asProblem(error);
            patchState(store, { launch: { status: 'error', problem } });
            if (problem.status === 409 && problem.code === 'EXPORT_IN_PROGRESS') {
              // Un autre onglet de ce navigateur a pu le lancer : son identifiant est en localStorage.
              if (!store.jobId()) patchState(store, { jobId: readJob() });
              if (store.jobId()) await refreshJob();
              if (!store.jobPending()) patchState(store, { conflict: true });
            }
            return false;
          }
        },

        /** Le délai d'attente après un 409 est écoulé : « Préparer l'export » se réactive. */
        clearConflict(): void {
          patchState(store, { conflict: false });
        },

        /**
         * Télécharge le zip par son URL signée ; null si rien n'est téléchargeable ou en cas d'erreur.
         * Un 410 EXPORT_EXPIRED bascule la ligne en « Expiré », sans erreur bloquante.
         */
        async downloadArchive(): Promise<DownloadedFile | null> {
          const data = store.job().data;
          if (!data?.downloadUrl) return null;
          patchState(store, { download: { status: 'busy', problem: null } });
          try {
            const file = await api.downloadExport(data.jobId, data.downloadUrl);
            patchState(store, { download: { status: 'idle', problem: null } });
            return file;
          } catch (error) {
            const problem = asProblem(error);
            if (problem.status === 410) {
              patchState(store, {
                download: { status: 'expired', problem },
                job: loaded({ ...data, downloadUrl: null }),
              });
            } else {
              patchState(store, { download: { status: 'error', problem } });
            }
            return null;
          }
        },
      };
    },
  ),
);
