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
  LinkChoice,
  toCreateBody,
} from '../../entries';
import { LinkTypeOption } from '../../graph';
import { CaptureApi } from './capture.api';
import { CaptureEntryType } from '../parser/parse.types';
import {
  CaptureDraft,
  CaptureEmotion,
  CaptureFieldName,
  CaptureFields,
  CapturedEntry,
  CaptureVisibility,
  EMPTY_DRAFT,
  ParsedSnapshot,
  reconcileDraft,
} from './capture.model';

/** La recherche « Autre entrée… » ne part qu'à partir de 2 caractères (comme la recherche du dossier). */
export const SEARCH_MIN_LENGTH = 2;

interface CaptureState {
  patientId: string | null;
  /** Vocabulaire des émotions : ce que le parseur reconnaît, la liste du champ Émotion. */
  emotions: Loadable<CaptureEmotion[]>;
  /** Catalogue des types de liens et matrice E5.3, gardé. */
  linkTypes: Loadable<LinkTypeOption[]>;
  /** Les cinq cibles de la rangée « Lié à » (chronologie du patient). */
  candidates: Loadable<LinkCandidate[]>;
  /**
   * Une écriture a eu lieu ailleurs dans le dossier (éditeur d'entrée, lien, séance) : le rail et le
   * vocabulaire se relisent à la prochaine saisie (on relit, on ne recalcule pas).
   */
  stale: boolean;
  saving: boolean;
  /** Problème du dernier enregistrement (422, 409, réseau) : affiché sous les champs et le bloc. */
  problem: ApiProblem | null;
  creatingEmotion: boolean;
  /** Problème de la création d'émotion (409 EMOTION_LABEL_EXISTS, 422). */
  emotionProblem: ApiProblem | null;
  /** Les choix faits à la main dans le bloc (UX-S1) : type, champs, lien, verbe. */
  draft: CaptureDraft;
  /** Résultats de « Autre entrée… » (GET /api/patients/{id}/search), pour la saisie courante. */
  search: Loadable<LinkCandidate[]>;
  searchQuery: string;
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
  draft: EMPTY_DRAFT,
  search: idle(),
  searchQuery: '',
};

/**
 * Bloc de saisie (B5, M6-02, puis UX-S1) : ce qu'il faut pour interpréter la saisie, la compléter à
 * la souris et l'enregistrer d'un coup. Fourni par le composant du bloc (il vit avec le dossier
 * ouvert). La saisie elle-même est l'état d'écran du composant ; ici, l'état serveur (vocabulaire,
 * cibles du rail, écriture, recherche) et le brouillon des choix manuels (type cliqué, champs, lien
 * et verbe), réconcilié à chaque lecture du parseur (reconcileDraft : la puce suit la grammaire).
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
    /** Numéro de la dernière recherche lancée : une réponse plus ancienne est ignorée. */
    let searchSeq = 0;

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

    function patchDraft(change: Partial<CaptureDraft>): void {
      patchState(store, { draft: { ...store.draft(), ...change } });
    }

    return {
      /**
       * Prépare le bloc pour ce patient : charge ce qui manque (vocabulaire, catalogue des liens,
       * cibles du rail), relit ce qui est périmé, et attend les lectures en cours. Un autre patient
       * vide le rail et le brouillon.
       */
      async prepare(patientId: string): Promise<void> {
        if (store.patientId() !== patientId) {
          patchState(store, {
            patientId,
            candidates: idle(),
            problem: null,
            draft: EMPTY_DRAFT,
            search: idle(),
            searchQuery: '',
          });
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

      // Brouillon des choix manuels (UX-S1) -----------------------------------------------------

      /** Le parseur a relu la saisie : les choix que la grammaire contredit s'effacent. */
      applyParsed(snapshot: ParsedSnapshot | null): void {
        const next = reconcileDraft(store.draft(), snapshot);
        if (next !== store.draft()) patchState(store, { draft: next });
        if (!snapshot && store.searchQuery()) {
          patchState(store, { search: idle(), searchQuery: '' });
        }
      },

      /** Puce de type cliquée ; le même type que la grammaire : on la suit à nouveau (null). */
      chooseType(type: CaptureEntryType): void {
        const parsed = store.draft().parsed;
        patchDraft({ type: parsed?.type === type ? null : type });
      },

      /** Un champ posé à la main par-dessus la lecture du parseur. */
      setField<K extends CaptureFieldName>(name: K, value: CaptureFields[K]): void {
        patchDraft({ overrides: { ...store.draft().overrides, [name]: value } });
        if (store.problem()) patchState(store, { problem: null });
      },

      /** Le champ reprend la valeur lue par le parseur (ou sa valeur par défaut). */
      clearField(name: CaptureFieldName): void {
        const overrides = { ...store.draft().overrides };
        delete overrides[name];
        patchDraft({ overrides });
      },

      /**
       * Une puce de la rangée « Lié à » cliquée : UN lien, avec le premier verbe admis (ou celui
       * donné). Cliquer la cible du `>` la retire ; cliquer la cible déjà posée la retire aussi.
       */
      toggleLink(candidateId: string, choice: LinkChoice, fromTargetId: string | null): void {
        const draft = store.draft();
        const current = draft.pickedLink?.targetId ?? null;
        if (current === candidateId) {
          patchDraft({ pickedLink: null, dismissedTarget: fromTargetId });
          return;
        }
        if (!current && fromTargetId === candidateId && draft.dismissedTarget !== candidateId) {
          patchDraft({ pickedLink: null, dismissedTarget: candidateId });
          return;
        }
        patchDraft({
          pickedLink: {
            targetId: candidateId,
            linkType: choice.linkType,
            direction: choice.direction,
          },
          dismissedTarget: null,
          extraCandidate: draft.extraCandidate?.id === candidateId ? draft.extraCandidate : null,
        });
        if (store.problem()) patchState(store, { problem: null });
      },

      /** Le verbe du lien posé (liste des verbes admis pour la paire). */
      chooseVerb(candidateId: string, choice: LinkChoice): void {
        patchDraft({
          pickedLink: {
            targetId: candidateId,
            linkType: choice.linkType,
            direction: choice.direction,
          },
          dismissedTarget: null,
        });
      },

      /** « Autre entrée… » : la cible trouvée remplace le lien précédent (un seul lien dans le bloc). */
      pickOther(candidate: LinkCandidate, choice: LinkChoice): void {
        patchDraft({
          pickedLink: {
            targetId: candidate.id,
            linkType: choice.linkType,
            direction: choice.direction,
          },
          dismissedTarget: null,
          extraCandidate: candidate,
        });
        patchState(store, { search: idle(), searchQuery: '' });
      },

      /** Retire le lien posé, quelle qu'en soit l'origine. */
      removeLink(fromTargetId: string | null): void {
        patchDraft({ pickedLink: null, dismissedTarget: fromTargetId, extraCandidate: null });
      },

      /** Le bloc est vidé (enregistré, parti dans l'éditeur) : plus aucun choix. */
      clearDraft(): void {
        patchState(store, { draft: EMPTY_DRAFT, search: idle(), searchQuery: '' });
      },

      /**
       * GET /api/patients/{id}/search?q= pour « Autre entrée… » : une seule lecture en vol compte, la
       * dernière ; en dessous de 2 caractères, rien ne part et la liste se vide.
       */
      async searchEntries(query: string): Promise<void> {
        const patientId = store.patientId();
        const q = query.trim();
        patchState(store, { searchQuery: q });
        if (!patientId || q.length < SEARCH_MIN_LENGTH) {
          patchState(store, { search: idle() });
          return;
        }
        const seq = ++searchSeq;
        patchState(store, { search: loading(store.search()) });
        try {
          const list = await api.searchEntries(patientId, q);
          if (seq === searchSeq) patchState(store, { search: loaded(list) });
        } catch (error) {
          if (seq === searchSeq) {
            patchState(store, { search: failed(asProblem(error), store.search()) });
          }
        }
      },

      clearSearch(): void {
        searchSeq++;
        patchState(store, { search: idle(), searchQuery: '' });
      },

      // Écriture -----------------------------------------------------------------------------------

      /**
       * POST /api/patients/{id}/entries depuis la saisie composée : `final` (Entrée) ou `draft`
       * (Ctrl+S), séance courante (pas de sessionId). Seuls les liens vers une cible affichée (rail,
       * ou « Autre entrée… ») partent. Visibilité : celle choisie, sinon la préférence. Succès :
       * l'entrée créée, puis le rail relu ; échec : null, problème rangé.
       */
      async save(
        patientId: string,
        prefill: EntryPrefill,
        status: 'final' | 'draft' = 'final',
        visibility?: CaptureVisibility,
      ): Promise<CapturedEntry | null> {
        if (store.saving()) return null;
        patchState(store, { saving: true, problem: null });
        const shown = new Set((store.candidates().data ?? []).map((item) => item.id));
        const extra = store.draft().extraCandidate;
        if (extra) shown.add(extra.id);
        const links = (prefill.links ?? []).filter((link) => shown.has(link.targetId));
        const chosen =
          visibility ?? (prefs.defaultVisibility() === 'private' ? 'private' : 'clinical');
        const body = toCreateBody(draftFromPrefill({ ...prefill, links }, chosen), status);
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
