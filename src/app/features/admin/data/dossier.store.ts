import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AdminApi } from './admin.api';
import { DecisionInput, Dossier, DossierDocument, ReviewedStatus } from './admin.model';

/** Document affiché dans la visionneuse : URL blob locale et URL signée (bouton « Ouvrir »). */
export interface ViewerFile {
  documentId: string;
  objectUrl: string;
  signedUrl: string;
  expiresAt: string | null;
}

interface DossierState {
  practitionerId: string | null;
  dossier: Loadable<Dossier>;
  /** Justificatifs dont la qualification part au serveur. */
  reviewing: string[];
  reviewProblem: ApiProblem | null;
  selectedDocumentId: string | null;
  viewer: Loadable<ViewerFile>;
  submitting: boolean;
  decisionProblem: ApiProblem | null;
}

const initialState: DossierState = {
  practitionerId: null,
  dossier: idle(),
  reviewing: [],
  reviewProblem: null,
  selectedDocumentId: null,
  viewer: idle(),
  submitting: false,
  decisionProblem: null,
};

/**
 * Dossier ouvert de la fiche 20 : détail, qualification des justificatifs (PATCH immédiat),
 * visionneuse (URL signée de 5 minutes, puis fichier lu en blob), décision. Après une décision, la
 * page relit la file (projection), le store ne recalcule rien. Fourni par la page.
 */
export const DossierStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    documents: computed(() => store.dossier().data?.documents ?? []),
    selectedDocument: computed<DossierDocument | null>(
      () =>
        store.dossier().data?.documents.find((d) => d.id === store.selectedDocumentId()) ?? null,
    ),
    /** Justificatifs non purgés qui ne sont pas encore conformes (approbation forcée sinon). */
    nonConform: computed(
      () =>
        (store.dossier().data?.documents ?? []).filter(
          (d) => !d.purged && d.reviewedStatus !== 'conform',
        ).length,
    ),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;
    let viewerRequest = 0;

    function releaseViewer(): void {
      const current = store.viewer().data;
      if (current) URL.revokeObjectURL(current.objectUrl);
    }

    async function showDocument(documentId: string | null): Promise<void> {
      const practitionerId = store.practitionerId();
      const ticket = ++viewerRequest;
      releaseViewer();
      patchState(store, { selectedDocumentId: documentId, viewer: idle() });
      const document = store.dossier().data?.documents.find((d) => d.id === documentId);
      if (!practitionerId || !document || document.purged) return;
      patchState(store, { viewer: loading() });
      try {
        const signed = await api.documentUrl(practitionerId, document.id);
        const blob = await api.documentFile(practitionerId, document.id, signed);
        if (ticket !== viewerRequest) return;
        patchState(store, {
          viewer: loaded({
            documentId: document.id,
            // Type imposé par le dossier (pdf, png, jpeg), pas par l'en-tête de la réponse.
            objectUrl: URL.createObjectURL(new Blob([blob], { type: document.mime })),
            signedUrl: signed.url,
            expiresAt: signed.expiresAt,
          }),
        });
      } catch (error) {
        if (ticket === viewerRequest) patchState(store, { viewer: failed(asProblem(error)) });
      }
    }

    async function load(practitionerId: string): Promise<void> {
      const ticket = ++request;
      const same = practitionerId === store.practitionerId();
      if (!same) {
        ++viewerRequest;
        releaseViewer();
        patchState(store, { ...initialState, practitionerId, dossier: loading() });
      } else {
        patchState(store, { dossier: loading(store.dossier()) });
      }
      try {
        const dossier = await api.dossier(practitionerId);
        if (ticket !== request) return;
        patchState(store, { dossier: loaded(dossier) });
        if (!same) {
          const first = dossier.documents.find((d) => !d.purged) ?? null;
          await showDocument(first?.id ?? null);
        }
      } catch (error) {
        if (ticket === request) {
          patchState(store, { dossier: failed(asProblem(error), store.dossier()) });
        }
      }
    }

    return {
      load,
      showDocument,

      /** Ferme le dossier (file vide, dossier retiré de la file). */
      clear(): void {
        ++request;
        ++viewerRequest;
        releaseViewer();
        patchState(store, initialState);
      },

      /** Case « Conforme » : PATCH immédiat ; la ligne garde l'état du serveur. */
      async review(documentId: string, status: ReviewedStatus): Promise<void> {
        const practitionerId = store.practitionerId();
        if (!practitionerId) return;
        patchState(store, {
          reviewing: [...store.reviewing(), documentId],
          reviewProblem: null,
        });
        try {
          const updated = await api.reviewDocument(practitionerId, documentId, status);
          const dossier = store.dossier().data;
          if (dossier && store.practitionerId() === practitionerId) {
            patchState(store, {
              dossier: loaded({
                ...dossier,
                documents: dossier.documents.map((d) => (d.id === updated.id ? updated : d)),
              }),
            });
          }
        } catch (error) {
          patchState(store, { reviewProblem: asProblem(error) });
        } finally {
          patchState(store, { reviewing: store.reviewing().filter((id) => id !== documentId) });
        }
      },

      /** POST …/decision ; true si enregistrée. Le problème (409, 422) reste pour l'écran. */
      async decide(input: DecisionInput): Promise<boolean> {
        const practitionerId = store.practitionerId();
        if (!practitionerId || store.submitting()) return false;
        patchState(store, { submitting: true, decisionProblem: null });
        try {
          await api.decide(practitionerId, input);
          patchState(store, { submitting: false });
          return true;
        } catch (error) {
          patchState(store, { submitting: false, decisionProblem: asProblem(error) });
          return false;
        }
      },

      clearDecisionProblem(): void {
        patchState(store, { decisionProblem: null });
      },
    };
  }),
  withHooks((store) => ({
    onDestroy(): void {
      const current = store.viewer().data;
      if (current) URL.revokeObjectURL(current.objectUrl);
    },
  })),
);
