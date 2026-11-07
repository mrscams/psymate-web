import { DOCUMENT } from '@angular/common';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { DownloadedFile, ExportStatus, SuspendedApi, SuspendedCredentials } from './suspended.api';

/** Verrou par défaut si le 423 ne dit pas sa durée : 15 minutes (contrat). */
const DEFAULT_LOCK_SECONDS = 15 * 60;

/**
 * Clé sessionStorage du dernier export demandé (fiche 19 : `lastJobId` conservé côté client). Le
 * jeton de suivi du statusUrl donne accès au statut et au lien de l'export : il ne survit qu'à
 * l'onglet (rechargement), jamais à sa fermeture.
 */
export const EXPORT_JOB_STORAGE_KEY = 'psymate.suspended.export';

/** Codes 409 du recours qui ferment le formulaire : la décision est déjà contestée ou incontestable. */
const APPEAL_CLOSED_CODES = new Set([
  'APPEAL_ALREADY_OPEN',
  'APPEAL_ALREADY_USED',
  'APPEAL_NOT_ALLOWED',
]);

/** Le dernier job d'export et le jeton de suivi de son statusUrl. */
export interface ExportJobRef {
  jobId: string;
  token: string | null;
}

interface ActionState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
}

export type AppealStatus = 'idle' | 'busy' | 'submitted' | 'closed' | 'error';

interface SuspendedState {
  /** Vrai après un 202 otpRequired (export ou recours) : le champ code s'affiche. */
  otpRequired: boolean;
  /** Fin du verrou (423 + Retry-After), en ms depuis l'époque ; null sinon. */
  lockedUntil: number | null;
  job: ExportJobRef | null;
  exportStatus: Loadable<ExportStatus>;
  exportRequest: ActionState;
  download: { status: 'idle' | 'busy' | 'expired' | 'error'; problem: ApiProblem | null };
  appeal: { status: AppealStatus; submittedAt: string | null; problem: ApiProblem | null };
}

const ACTION_IDLE: ActionState = { status: 'idle', problem: null };

const initialState: SuspendedState = {
  otpRequired: false,
  lockedUntil: null,
  job: null,
  exportStatus: idle(),
  exportRequest: ACTION_IDLE,
  download: { status: 'idle', problem: null },
  appeal: { status: 'idle', submittedAt: null, problem: null },
};

/** Ce que la ligne d'état de l'export affiche (fiche 19, reprise par la fiche 27). */
export type ExportRowKind = 'none' | 'queued' | 'running' | 'ready' | 'expired' | 'failed';

/**
 * État du compte suspendu ou refusé (fiche 27) : export du compte (job asynchrone, lien 7 jours,
 * 410 ensuite) et recours (un seul par décision). Fourni à la racine : le recours envoyé reste
 * affiché tant que l'application n'est pas rechargée ; le job d'export survit dans sessionStorage.
 */
export const SuspendedStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ exportStatus, exportRequest, download }) => ({
    exportKind: computed<ExportRowKind>(() => {
      const data = exportStatus().data;
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
    }),
    /** Un job est en file ou en cours : « Exporter » attend (un seul export à la fois, 409 sinon). */
    exportPending: computed(() => {
      const status = exportStatus().data?.status;
      return exportRequest().status === 'busy' || status === 'queued' || status === 'running';
    }),
  })),
  withMethods((store, api = inject(SuspendedApi), document = inject(DOCUMENT)) => {
    const storage = (): Storage | null => {
      try {
        return document.defaultView?.sessionStorage ?? null;
      } catch {
        return null;
      }
    };

    function saveJob(job: ExportJobRef | null): void {
      patchState(store, { job });
      try {
        if (job) storage()?.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify(job));
        else storage()?.removeItem(EXPORT_JOB_STORAGE_KEY);
      } catch {
        // Stockage indisponible : le job vit en mémoire le temps de la page.
      }
    }

    function readJob(): ExportJobRef | null {
      try {
        const raw = storage()?.getItem(EXPORT_JOB_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ExportJobRef>;
        return typeof parsed.jobId === 'string' && parsed.jobId
          ? { jobId: parsed.jobId, token: typeof parsed.token === 'string' ? parsed.token : null }
          : null;
      } catch {
        return null;
      }
    }

    function lockFrom(problem: ApiProblem): number | null {
      return problem.status === 423
        ? Date.now() + (problem.retryAfterSeconds ?? DEFAULT_LOCK_SECONDS) * 1000
        : null;
    }

    async function refreshExport(): Promise<void> {
      const job = store.job();
      if (!job) return;
      patchState(store, { exportStatus: loading(store.exportStatus()) });
      try {
        const status = await api.exportStatus(job.jobId, job.token);
        patchState(store, { exportStatus: loaded(status) });
      } catch (error) {
        const problem = asProblem(error);
        if (problem.status === 404) {
          // Job inconnu ou jeton faux : la ligne disparaît (fiche 19).
          saveJob(null);
          patchState(store, { exportStatus: idle() });
          return;
        }
        patchState(store, { exportStatus: failed(problem, store.exportStatus()) });
      }
    }

    return {
      /** Au retour sur la page : reprend le dernier job et réinterroge son état. */
      async restore(): Promise<void> {
        if (store.job()) return;
        const job = readJob();
        if (!job) return;
        patchState(store, { job });
        await refreshExport();
      },

      refreshExport,

      /**
       * POST /api/me/export : vrai quand un job est créé (son suivi démarre). Faux sinon : code 2FA
       * demandé (`otpRequired`), 409 EXPORT_IN_PROGRESS ou ACCOUNT_NOT_SUSPENDED, 401, 403, 423…
       * dans `exportRequest.problem`.
       */
      async requestExport(credentials: SuspendedCredentials): Promise<boolean> {
        patchState(store, {
          exportRequest: { status: 'busy', problem: null },
          download: { status: 'idle', problem: null },
        });
        try {
          const outcome = await api.requestExport(credentials);
          if (outcome.kind === 'otp-required') {
            patchState(store, { otpRequired: true, exportRequest: ACTION_IDLE });
            return false;
          }
          saveJob({ jobId: outcome.jobId, token: outcome.token });
          patchState(store, { exportRequest: ACTION_IDLE, exportStatus: loading() });
          await refreshExport();
          return true;
        } catch (error) {
          const problem = asProblem(error);
          patchState(store, {
            exportRequest: { status: 'error', problem },
            lockedUntil: lockFrom(problem),
          });
          return false;
        }
      },

      /**
       * Télécharge le zip par son URL signée ; le fichier est rendu à la page, qui déclenche
       * l'enregistrement. Null si rien n'est téléchargeable ou en cas d'erreur : un 410
       * EXPORT_EXPIRED bascule la ligne en « expiré », sans erreur bloquante.
       */
      async downloadExport(): Promise<DownloadedFile | null> {
        const data = store.exportStatus().data;
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
              exportStatus: loaded({ ...data, downloadUrl: null }),
            });
          } else {
            patchState(store, { download: { status: 'error', problem } });
          }
          return null;
        }
      },

      /**
       * POST /api/me/appeal : vrai sur 201 (le formulaire laisse place à l'état du recours). Faux :
       * code 2FA demandé, 409 (recours déjà ouvert, déjà examiné, rien à contester : `appeal.status`
       * passe à `closed`), 401, 422, 423… dans `appeal.problem`.
       */
      async submitAppeal(credentials: SuspendedCredentials, message: string): Promise<boolean> {
        patchState(store, { appeal: { ...store.appeal(), status: 'busy', problem: null } });
        try {
          const outcome = await api.submitAppeal(credentials, message);
          if (outcome.kind === 'otp-required') {
            patchState(store, {
              otpRequired: true,
              appeal: { status: 'idle', submittedAt: null, problem: null },
            });
            return false;
          }
          patchState(store, {
            appeal: { status: 'submitted', submittedAt: outcome.submittedAt, problem: null },
          });
          return true;
        } catch (error) {
          const problem = asProblem(error);
          const closed = problem.status === 409 && APPEAL_CLOSED_CODES.has(problem.code);
          patchState(store, {
            appeal: { status: closed ? 'closed' : 'error', submittedAt: null, problem },
            lockedUntil: lockFrom(problem),
          });
          return false;
        }
      },

      /** Le compte à rebours du verrou est fini. */
      unlock(): void {
        patchState(store, { lockedUntil: null });
      },

      /** « Relancer » après un échec ou un lien expiré : la ligne repart de zéro. */
      forgetExport(): void {
        saveJob(null);
        patchState(store, { exportStatus: idle(), download: { status: 'idle', problem: null } });
      },
    };
  }),
);
