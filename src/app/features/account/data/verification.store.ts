import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import {
  DocumentUploadInput,
  ProfessionalInfoPatch,
  Verification,
  VerificationApi,
} from './verification.api';

/** Un envoi en cours ou son résultat (fiche 13 : progression, erreurs 413 / 415 sous le champ). */
export interface UploadState {
  status: 'idle' | 'uploading' | 'error';
  percent: number;
  problem: ApiProblem | null;
}

interface ActionState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
}

interface VerificationState {
  dossier: Loadable<Verification>;
  upload: UploadState;
  submission: ActionState;
  info: ActionState & { savedAt: number | null };
  /** Identifiant du justificatif en cours de retrait, et l'erreur du dernier retrait. */
  removing: string | null;
  removeProblem: ApiProblem | null;
}

const ACTION_IDLE: ActionState = { status: 'idle', problem: null };

const initialState: VerificationState = {
  dossier: idle(),
  upload: { status: 'idle', percent: 0, problem: null },
  submission: ACTION_IDLE,
  info: { ...ACTION_IDLE, savedAt: null },
  removing: null,
  removeProblem: null,
};

/** Statuts où le dossier se modifie (dépôt, retrait, soumission) : contrat et fiche 13. */
const EDITABLE_STATUSES = new Set(['docs_pending', 'needs_more']);

/**
 * État serveur du dossier professionnel (fourni par la page). Après chaque écriture, la projection
 * est relue (GET /api/me/verification) plutôt que recalculée ; après la soumission, la session est
 * rechargée pour que le bandeau d'état change sans rechargement.
 */
export const VerificationStore = signalStore(
  withState(initialState),
  withComputed(({ dossier }) => ({
    verification: computed(() => dossier().data),
    status: computed(() => dossier().data?.status ?? null),
    documents: computed(() => dossier().data?.documents ?? []),
    missing: computed(() => dossier().data?.missing ?? []),
    recommended: computed(() => dossier().data?.recommended ?? []),
    /** Dépôt, retrait et soumission possibles (docs_pending, needs_more). */
    editable: computed(() => EDITABLE_STATUSES.has(dossier().data?.status ?? '')),
  })),
  withComputed(({ editable, missing }) => ({
    /** Règle de complétude du serveur reflétée : rien ne manque et le dossier est modifiable. */
    canSubmit: computed(() => editable() && missing().length === 0),
  })),
  withMethods((store, api = inject(VerificationApi), session = inject(SessionStore)) => {
    async function reload(): Promise<void> {
      patchState(store, { dossier: loading(store.dossier()) });
      try {
        patchState(store, { dossier: loaded(await api.load()) });
      } catch (error) {
        patchState(store, { dossier: failed(asProblem(error), store.dossier()) });
      }
    }

    return {
      /** GET /api/me/verification ; la donnée précédente reste pendant le rechargement. */
      load: reload,

      /**
       * Dépose un justificatif avec sa progression ; vrai si le dossier a été relu avec le nouveau
       * document, faux sinon (l'erreur reste dans `upload.problem` pour le champ fichier).
       */
      async uploadDocument(input: DocumentUploadInput, file: File): Promise<boolean> {
        patchState(store, { upload: { status: 'uploading', percent: 0, problem: null } });
        try {
          await new Promise<void>((resolve, reject) => {
            api.upload(input, file).subscribe({
              next: (event) => {
                if (event.kind === 'progress') {
                  patchState(store, {
                    upload: { status: 'uploading', percent: event.percent, problem: null },
                  });
                }
              },
              error: reject,
              complete: resolve,
            });
          });
          patchState(store, { upload: { status: 'idle', percent: 100, problem: null } });
          await reload();
          return true;
        } catch (error) {
          patchState(store, {
            upload: { status: 'error', percent: 0, problem: asProblem(error) },
          });
          return false;
        }
      },

      /** Oublie l'erreur ou le résultat du dernier envoi (nouveau fichier choisi). */
      resetUpload(): void {
        patchState(store, { upload: { status: 'idle', percent: 0, problem: null } });
      },

      /** DELETE d'un justificatif puis relecture ; faux sur erreur (409 verrou, 404…). */
      async remove(id: string): Promise<boolean> {
        patchState(store, { removing: id, removeProblem: null });
        try {
          await api.remove(id);
          patchState(store, { removing: null });
          await reload();
          return true;
        } catch (error) {
          patchState(store, { removing: null, removeProblem: asProblem(error) });
          return false;
        }
      },

      /**
       * POST submit → under_review ; la session serveur est rafraîchie (GET /api/auth/session) puis
       * relue par core/auth (GET /api/auth/me) pour que le bandeau d'état change sans rechargement.
       */
      async submit(): Promise<boolean> {
        patchState(store, { submission: { status: 'busy', problem: null } });
        try {
          const dossier = await api.submit();
          patchState(store, { dossier: loaded(dossier), submission: ACTION_IDLE });
        } catch (error) {
          patchState(store, { submission: { status: 'error', problem: asProblem(error) } });
          return false;
        }
        // Effet secondaire : le dossier est soumis même si le bandeau ne peut pas être rafraîchi.
        try {
          await api.refreshSession();
          await session.load();
        } catch {
          // Le prochain chargement de l'application relira la session.
        }
        return true;
      },

      /** PATCH des informations professionnelles ; la réponse remplace celles du dossier. */
      async saveInfo(patch: ProfessionalInfoPatch): Promise<boolean> {
        patchState(store, { info: { status: 'busy', problem: null, savedAt: null } });
        try {
          const info = await api.updateInfo(patch);
          const current = store.dossier();
          patchState(store, {
            dossier: current.data ? loaded({ ...current.data, professionalInfo: info }) : current,
            info: { status: 'idle', problem: null, savedAt: Date.now() },
          });
          return true;
        } catch (error) {
          patchState(store, {
            info: { status: 'error', problem: asProblem(error), savedAt: null },
          });
          return false;
        }
      },

      /** URL signée (5 min) du fichier, pour l'ouvrir dans un nouvel onglet ; null sur erreur. */
      async documentUrl(id: string): Promise<string | null> {
        try {
          return await api.documentUrl(id);
        } catch {
          return null;
        }
      },
    };
  }),
);
