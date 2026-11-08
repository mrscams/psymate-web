import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import {
  draftFromPrefill,
  EmotionFamily,
  EntryPrefill,
  LinkCandidate,
  toCreateBody,
} from '../../entries';
import { LinkTypeOption } from '../../graph';
import { CaptureApi } from './capture.api';
import { CaptureEmotion, CapturedEntry } from './capture.model';

interface CaptureState {
  patientId: string | null;
  /** Vocabulaire des émotions : ce que le parseur reconnaît, pastilles de l'aperçu. */
  emotions: Loadable<CaptureEmotion[]>;
  /** Catalogue des types de liens et matrice E5.3, gardé. */
  linkTypes: Loadable<LinkTypeOption[]>;
  /** Les cinq cibles du rail « Lié à… » (chronologie du patient). */
  candidates: Loadable<LinkCandidate[]>;
  /**
   * Une écriture a eu lieu ailleurs dans le dossier (éditeur d'entrée, lien, séance) : le rail et le
   * vocabulaire se relisent à la prochaine saisie (on relit, on ne recalcule pas).
   */
  stale: boolean;
  saving: boolean;
  /** Problème du dernier enregistrement (422, 409, réseau) : affiché sous la barre. */
  problem: ApiProblem | null;
  creatingEmotion: boolean;
  /** Problème de la création d'émotion (409 EMOTION_LABEL_EXISTS, 422). */
  emotionProblem: ApiProblem | null;
}

const initialState: CaptureState = {
  patientId: null,
  emotions: idle(),
  linkTypes: idle(),
  candidates: idle(),
  stale: false,
  saving: false,
  problem: null,
  creatingEmotion: false,
  emotionProblem: null,
};

/**
 * Barre de commande (B5, M6-02) : ce qu'il faut pour interpréter la saisie et l'enregistrer d'un
 * coup. Fournie par le composant de la barre (elle vit avec le dossier ouvert). La saisie elle-même
 * est l'état d'écran du composant ; ici, l'état serveur : vocabulaire, cibles du rail, écriture.
 * Le corps du POST vient de features/entries (draftFromPrefill + toCreateBody), comme pour
 * l'éditeur : mêmes champs, jamais authorType ni submissionId. Après une création, les cibles du
 * rail se relisent (projection) : l'entrée créée y apparaît.
 */
export const CaptureStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(CaptureApi), prefs = inject(PreferencesStore)) => {
    // Une lecture à la fois par ressource : un second appel attend celle en cours (Entrée tapée
    // pendant le chargement). Les lectures commencent au tour suivant : le verrou est posé avant.
    let emotionsWork: Promise<void> | null = null;
    let linkTypesWork: Promise<void> | null = null;
    /** Lecture des cibles du rail en cours, et le patient pour lequel elle a été lancée. */
    let candidatesWork: { patientId: string; done: Promise<void> } | null = null;

    function loadEmotions(): Promise<void> {
      if (emotionsWork) return emotionsWork;
      patchState(store, { emotions: loading(store.emotions()) });
      const done: Promise<void> = Promise.resolve()
        .then(() => api.emotions())
        .then(
          (list) => patchState(store, { emotions: loaded(list) }),
          (error: unknown) =>
            patchState(store, { emotions: failed(asProblem(error), store.emotions()) }),
        )
        .finally(() => {
          if (emotionsWork === done) emotionsWork = null;
        });
      emotionsWork = done;
      return done;
    }

    function loadLinkTypes(): Promise<void> {
      if (linkTypesWork) return linkTypesWork;
      patchState(store, { linkTypes: loading(store.linkTypes()) });
      const done: Promise<void> = Promise.resolve()
        .then(() => api.linkTypes())
        .then(
          (list) => patchState(store, { linkTypes: loaded(list) }),
          (error: unknown) =>
            patchState(store, { linkTypes: failed(asProblem(error), store.linkTypes()) }),
        )
        .finally(() => {
          if (linkTypesWork === done) linkTypesWork = null;
        });
      linkTypesWork = done;
      return done;
    }

    function loadCandidates(patientId: string): Promise<void> {
      if (candidatesWork?.patientId === patientId) return candidatesWork.done;
      patchState(store, { candidates: loading(store.candidates()) });
      const done: Promise<void> = Promise.resolve()
        .then(() => api.railCandidates(patientId))
        .then(
          (list) => {
            if (store.patientId() === patientId) patchState(store, { candidates: loaded(list) });
          },
          (error: unknown) => {
            if (store.patientId() === patientId)
              patchState(store, { candidates: failed(asProblem(error), store.candidates()) });
          },
        )
        .finally(() => {
          if (candidatesWork?.done === done) candidatesWork = null;
        });
      candidatesWork = { patientId, done };
      return done;
    }

    return {
      /**
       * Prépare la barre pour ce patient : charge ce qui manque (vocabulaire, catalogue des liens,
       * cibles du rail), relit ce qui est périmé, et attend les lectures en cours. Un autre patient
       * vide le rail.
       */
      async prepare(patientId: string): Promise<void> {
        if (store.patientId() !== patientId) {
          patchState(store, { patientId, candidates: idle(), problem: null });
        }
        const stale = store.stale();
        if (stale) patchState(store, { stale: false });
        const work: Promise<void>[] = [];
        if (emotionsWork) work.push(emotionsWork);
        else if (stale || store.emotions().status !== 'loaded') work.push(loadEmotions());
        if (linkTypesWork) work.push(linkTypesWork);
        else if (store.linkTypes().status !== 'loaded') work.push(loadLinkTypes());
        if (candidatesWork?.patientId === patientId) work.push(candidatesWork.done);
        else if (stale || store.candidates().status !== 'loaded') {
          work.push(loadCandidates(patientId));
        }
        await Promise.all(work);
      },

      /** Une écriture ailleurs dans le dossier : relire rail et vocabulaire à la prochaine saisie. */
      markStale(): void {
        patchState(store, { stale: true });
      },

      /**
       * POST /api/patients/{id}/entries depuis la saisie interprétée : `final` (Entrée) ou `draft`
       * (Ctrl+S), séance courante (pas de sessionId). Seuls les liens vers une cible affichée dans le
       * rail partent. Succès : l'entrée créée, puis le rail relu ; échec : null, problème rangé.
       */
      async save(
        patientId: string,
        prefill: EntryPrefill,
        status: 'final' | 'draft' = 'final',
      ): Promise<CapturedEntry | null> {
        if (store.saving()) return null;
        patchState(store, { saving: true, problem: null });
        const shown = new Set((store.candidates().data ?? []).map((item) => item.id));
        const links = (prefill.links ?? []).filter((link) => shown.has(link.targetId));
        const visibility = prefs.defaultVisibility() === 'private' ? 'private' : 'clinical';
        const body = toCreateBody(draftFromPrefill({ ...prefill, links }, visibility), status);
        try {
          const saved = await api.create(patientId, body);
          patchState(store, { saving: false });
          if (store.patientId() === patientId) void loadCandidates(patientId);
          return saved;
        } catch (error) {
          patchState(store, { saving: false, problem: asProblem(error) });
          return null;
        }
      },

      /**
       * POST /api/me/emotions (fiche 17) : l'émotion rejoint aussitôt le vocabulaire (la saisie est
       * réinterprétée), puis le vocabulaire est relu. 409 EMOTION_LABEL_EXISTS → emotionProblem.
       */
      async createEmotion(label: string, family: EmotionFamily): Promise<CaptureEmotion | null> {
        if (store.creatingEmotion()) return null;
        patchState(store, { creatingEmotion: true, emotionProblem: null });
        try {
          const emotion = await api.createEmotion(label.trim(), family);
          const list = store.emotions().data ?? [];
          patchState(store, {
            creatingEmotion: false,
            emotions: loaded([...list.filter((item) => item.code !== emotion.code), emotion]),
          });
          // Relecture du vocabulaire après une éventuelle lecture en cours (elle ne la connaît pas).
          void (emotionsWork ?? Promise.resolve()).then(() => loadEmotions());
          return emotion;
        } catch (error) {
          patchState(store, { creatingEmotion: false, emotionProblem: asProblem(error) });
          return null;
        }
      },

      clearProblem(): void {
        patchState(store, { problem: null });
      },

      clearEmotionProblem(): void {
        patchState(store, { emotionProblem: null });
      },

      retryEmotions(): Promise<void> {
        return emotionsWork ?? loadEmotions();
      },

      /** Rail en erreur : relit le catalogue (s'il manque) et les cibles. */
      async retryRail(): Promise<void> {
        const patientId = store.patientId();
        if (!patientId) return;
        const work = [loadCandidates(patientId)];
        if (store.linkTypes().status !== 'loaded') work.push(linkTypesWork ?? loadLinkTypes());
        await Promise.all(work);
      },
    };
  }),
);
