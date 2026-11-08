import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { EntriesApi } from './entries.api';
import {
  draftFromEntry,
  Emotion,
  EmotionFamily,
  emptyDraft,
  EntryDraft,
  EntryStatus,
  EntryVersion,
  EntryView,
  EntryVisibility,
  graceInfo,
  GraceInfo,
  SessionOption,
  toCreateBody,
  toPatchBody,
} from './entry.model';

export type EditorMode = 'create' | 'edit';

/** Ce que l'éditeur ouvre : une nouvelle entrée (type, texte de la barre de capture) ou une correction. */
export interface EditorTarget {
  patientId: string;
  entryId?: string | null;
  type?: EntryType;
  text?: string;
}

interface EntryEditorState {
  /** Compte pour lequel le vocabulaire et les brouillons sont gardés (remis à zéro s'il change). */
  ownerId: string | null;
  patientId: string | null;
  mode: EditorMode;
  entryId: string | null;
  /** Entrée corrigée (GET /api/entries/{id}). */
  entry: Loadable<EntryView>;
  /** Historique (GET /api/entries/{id}/versions), la plus récente en premier. */
  versions: Loadable<EntryVersion[]>;
  /** Séance courante (GET …/sessions/current) : ouverte, sinon dernière, sinon accueil ; null si aucune. */
  currentSession: SessionOption | null;
  /** Séances du patient pour le bloc Séance. */
  sessions: Loadable<SessionOption[]>;
  emotions: Loadable<Emotion[]>;
  tags: Loadable<string[]>;
  /** Brouillons conservés à Échap : `create:<patientId>` ou `edit:<entryId>`, en mémoire seulement. */
  drafts: Record<string, EntryDraft>;
  saving: boolean;
  /** Problème du dernier enregistrement (422 par champ, 409, réseau) : affiché par le panneau. */
  problem: ApiProblem | null;
  creatingEmotion: boolean;
  /** Problème de la création d'émotion en ligne (409 EMOTION_LABEL_EXISTS, 422). */
  emotionProblem: ApiProblem | null;
  /** Le panneau est ouvert sur la cible courante. */
  active: boolean;
  /** Horloge du bandeau de grâce (ms), avancée par le panneau (tick). */
  now: number;
}

const initialState: EntryEditorState = {
  ownerId: null,
  patientId: null,
  mode: 'create',
  entryId: null,
  entry: idle(),
  versions: idle(),
  currentSession: null,
  sessions: idle(),
  emotions: idle(),
  tags: idle(),
  drafts: {},
  saving: false,
  problem: null,
  creatingEmotion: false,
  emotionProblem: null,
  active: false,
  now: 0,
};

export function draftKey(target: { patientId: string; entryId?: string | null }): string {
  return target.entryId ? `edit:${target.entryId}` : `create:${target.patientId}`;
}

/**
 * Éditeur d'entrée (fiche 05, B4 écran 5) : ce qu'il faut au panneau pour créer ou corriger une
 * entrée, et les brouillons. Fourni à la racine : le panneau (SidePanelService) n'injecte que des
 * services racine, et le brouillon doit survivre à la fermeture par Échap (fiche 05 : « Échap ferme
 * en conservant le brouillon »). Les brouillons restent en mémoire (jamais en Web Storage : données
 * cliniques) et sont effacés si le compte connecté change. Le formulaire est l'état d'écran du
 * panneau ; il range sa valeur ici (keepDraft) en se fermant. Après une écriture, l'entrée vient de
 * la réponse du serveur ; le numéro de version aussi (la grâce n'est qu'une annonce).
 */
export const EntryEditorStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store, session = inject(SessionStore), prefs = inject(PreferencesStore)) => ({
    /**
     * Types proposés : Médicament seulement si la préférence entryTypes.medicationVisible l'autorise
     * (fiche 14 ; psychiatre par défaut). Une correction garde le type de l'entrée, verrouillé.
     */
    types: computed<EntryType[]>(() => {
      const entry = store.entry().data;
      if (prefs.medicationVisible() !== false || entry?.type === 'medication') {
        return [...ENTRY_TYPES];
      }
      return ENTRY_TYPES.filter((type) => type !== 'medication');
    }),
    key: computed(() => {
      const patientId = store.patientId();
      return patientId ? draftKey({ patientId, entryId: store.entryId() }) : null;
    }),
    /** Correction : grâce, échéance, numéro de la future version. */
    grace: computed<GraceInfo | null>(() => {
      const entry = store.entry().data;
      if (store.mode() !== 'edit' || !entry) return null;
      const now = new Date(store.now() || Date.now());
      return graceInfo(entry, store.versions().data ?? [], session.me()?.id ?? null, now);
    }),
    /** Séances proposées : la liste, la séance courante en tête si elle n'y est pas. */
    sessionOptions: computed<SessionOption[]>(() => {
      const current = store.currentSession();
      const list = store.sessions().data ?? [];
      const merged = list.map((option) =>
        current && option.id === current.id ? { ...option, open: current.open } : option,
      );
      if (current && !merged.some((option) => option.id === current.id)) merged.unshift(current);
      return merged;
    }),
    versionCount: computed(() => store.versions().data?.length ?? 0),
    /** Erreurs par champ du dernier 422 (`feeling.emotionCode` → message). */
    errors: computed<Record<string, string>>(() =>
      Object.fromEntries(
        (store.problem()?.errors ?? [])
          .filter((error) => !!error.field)
          .map((error) => [error.field, error.message]),
      ),
    ),
  })),
  withMethods(
    (
      store,
      api = inject(EntriesApi),
      session = inject(SessionStore),
      prefs = inject(PreferencesStore),
    ) => {
      /** Un autre compte : vocabulaire, tags et brouillons du précédent sont oubliés. */
      function checkOwner(): void {
        const owner = session.me()?.id ?? null;
        if (store.ownerId() !== owner) patchState(store, { ...initialState, ownerId: owner });
      }

      function defaultVisibility(): EntryVisibility {
        return prefs.defaultVisibility() === 'private' ? 'private' : 'clinical';
      }

      async function loadEmotions(force = false): Promise<void> {
        if (!force && store.emotions().status === 'loaded') return;
        patchState(store, { emotions: loading(store.emotions()) });
        try {
          patchState(store, { emotions: loaded(await api.emotions()) });
        } catch (error) {
          patchState(store, { emotions: failed(asProblem(error), store.emotions()) });
        }
      }

      async function loadTags(): Promise<void> {
        if (store.tags().status === 'loaded') return;
        patchState(store, { tags: loading(store.tags()) });
        try {
          patchState(store, { tags: loaded(await api.tagLabels()) });
        } catch (error) {
          patchState(store, { tags: failed(asProblem(error), store.tags()) });
        }
      }

      async function loadSessions(patientId: string): Promise<void> {
        patchState(store, { sessions: loading(store.sessions()) });
        try {
          const [current, list] = await Promise.all([
            api.currentSession(patientId),
            api.sessionsOf(patientId),
          ]);
          if (store.patientId() !== patientId) return;
          patchState(store, { currentSession: current, sessions: loaded(list) });
        } catch (error) {
          if (store.patientId() !== patientId) return;
          patchState(store, { sessions: failed(asProblem(error), store.sessions()) });
        }
      }

      async function loadVersions(entryId: string): Promise<void> {
        patchState(store, { versions: loading(store.versions()) });
        try {
          const versions = await api.versions(entryId);
          if (store.entryId() === entryId) patchState(store, { versions: loaded(versions) });
        } catch (error) {
          if (store.entryId() === entryId)
            patchState(store, { versions: failed(asProblem(error), store.versions()) });
        }
      }

      async function loadEntry(entryId: string): Promise<void> {
        patchState(store, { entry: loading(store.entry()) });
        try {
          const entry = await api.get(entryId);
          if (store.entryId() !== entryId) return;
          // Le brouillon d'abord : le panneau construit son formulaire dès que l'entrée arrive.
          const key = draftKey({ patientId: store.patientId() ?? entry.patientId, entryId });
          if (!store.drafts()[key]) {
            patchState(store, { drafts: { ...store.drafts(), [key]: draftFromEntry(entry) } });
          }
          patchState(store, { entry: loaded(entry) });
        } catch (error) {
          if (store.entryId() === entryId)
            patchState(store, { entry: failed(asProblem(error), store.entry()) });
        }
      }

      function setDraft(key: string, draft: EntryDraft | null): void {
        const drafts = { ...store.drafts() };
        if (draft) drafts[key] = draft;
        else delete drafts[key];
        patchState(store, { drafts });
      }

      return {
        /**
         * Ouvre l'éditeur sur une cible. Création : le brouillon du patient s'il existe (le texte de
         * la barre de capture s'y ajoute si son texte est vide), sinon un brouillon vide du type
         * demandé ; correction : l'entrée et son historique. Le vocabulaire et les tags sont gardés
         * d'une ouverture à l'autre ; les séances sont relues à chaque ouverture.
         */
        async open(target: EditorTarget): Promise<void> {
          checkOwner();
          const entryId = target.entryId ?? null;
          const samePatient = store.patientId() === target.patientId;
          patchState(store, {
            patientId: target.patientId,
            mode: entryId ? 'edit' : 'create',
            entryId,
            entry: idle(),
            versions: idle(),
            problem: null,
            emotionProblem: null,
            saving: false,
            active: true,
            now: Date.now(),
            ...(samePatient ? {} : { currentSession: null, sessions: idle() }),
          });
          const key = draftKey({ patientId: target.patientId, entryId });
          if (!entryId) {
            const existing = store.drafts()[key];
            const text = target.text?.trim() ?? '';
            if (!existing) {
              const draft = emptyDraft(target.type ?? 'note', defaultVisibility());
              draft.body = text;
              setDraft(key, draft);
            } else if (text) {
              // Rien ne se perd (B5) : le texte de la barre s'ajoute à celui du brouillon.
              const body = existing.body.trim() ? `${existing.body.trimEnd()}\n${text}` : text;
              setDraft(key, { ...existing, body });
            } else if (target.type && target.type !== existing.type && !text) {
              setDraft(key, { ...existing, type: target.type });
            }
          }
          const work: Promise<void>[] = [loadEmotions(), loadTags()];
          if (entryId) work.push(loadEntry(entryId), loadVersions(entryId));
          else work.push(loadSessions(target.patientId));
          await Promise.all(work);
        },

        /** Le panneau est-il ouvert sur cette cible (pas de seconde ouverture pour ?entry=) ? */
        isOpenOn(target: { patientId: string; entryId?: string | null }): boolean {
          return store.active() && store.key() === draftKey(target);
        },

        /** Le panneau de cette cible s'est fermé (Échap, croix, voile, enregistrement). */
        closed(key: string): void {
          if (store.key() !== key) return;
          patchState(store, { active: false, problem: null, emotionProblem: null });
        },

        /** Avance l'horloge du bandeau de grâce (la fenêtre peut se fermer panneau ouvert). */
        tick(now: number = Date.now()): void {
          patchState(store, { now });
        },

        /** Range la saisie du panneau sous sa clé (à la fermeture : Échap conserve le brouillon). */
        keepDraft(key: string, draft: EntryDraft): void {
          setDraft(key, draft);
        },

        /** Abandonne le brouillon courant (après un enregistrement réussi). */
        discardDraft(): void {
          const key = store.key();
          if (key) setDraft(key, null);
        },

        /** Le brouillon de la cible courante, s'il existe. */
        currentDraft(): EntryDraft | null {
          const key = store.key();
          return key ? (store.drafts()[key] ?? null) : null;
        },

        /**
         * Enregistre : POST (création, `status` final ou draft pour Ctrl+S) ou PATCH (correction, seules
         * les clés modifiées ; rien à envoyer → l'entrée telle quelle). Succès : le brouillon est
         * effacé et l'entrée du serveur rendue. Échec : le brouillon reste, le problème est rangé.
         */
        async save(draft: EntryDraft, status: EntryStatus = 'final'): Promise<EntryView | null> {
          const patientId = store.patientId();
          if (!patientId || store.saving()) return null;
          const key = draftKey({ patientId, entryId: store.entryId() });
          setDraft(key, draft);
          patchState(store, { saving: true, problem: null });
          try {
            let saved: EntryView;
            const entryId = store.entryId();
            if (entryId) {
              const entry = store.entry().data;
              if (!entry) throw { status: 0, code: 'ENTRY_NOT_LOADED' } satisfies ApiProblem;
              const body = toPatchBody(entry, draft, status);
              saved = body ? await api.patch(entryId, body) : entry;
            } else {
              saved = await api.create(patientId, toCreateBody(draft, status));
            }
            setDraft(key, null);
            patchState(store, { saving: false });
            if (entryId) {
              patchState(store, { entry: loaded(saved) });
              await loadVersions(entryId);
            }
            return saved;
          } catch (error) {
            patchState(store, { saving: false, problem: asProblem(error) });
            return null;
          }
        },

        /**
         * Crée une émotion personnalisée en ligne (fiche 17) puis relit le vocabulaire : elle est
         * proposée aussitôt dans l'autocomplétion. 409 EMOTION_LABEL_EXISTS → emotionProblem.
         */
        async createEmotion(label: string, family: EmotionFamily): Promise<Emotion | null> {
          patchState(store, { creatingEmotion: true, emotionProblem: null });
          try {
            const emotion = await api.createEmotion(label.trim(), family);
            const list = store.emotions().data ?? [];
            patchState(store, {
              creatingEmotion: false,
              emotions: loaded([...list.filter((item) => item.code !== emotion.code), emotion]),
            });
            void loadEmotions(true);
            return emotion;
          } catch (error) {
            patchState(store, { creatingEmotion: false, emotionProblem: asProblem(error) });
            return null;
          }
        },

        clearEmotionProblem(): void {
          patchState(store, { emotionProblem: null });
        },

        clearProblem(): void {
          patchState(store, { problem: null });
        },

        retryEmotions(): Promise<void> {
          return loadEmotions(true);
        },

        retryTags(): Promise<void> {
          patchState(store, { tags: idle() });
          return loadTags();
        },

        retrySessions(): Promise<void> {
          const patientId = store.patientId();
          return patientId ? loadSessions(patientId) : Promise.resolve();
        },

        retryEntry(): Promise<void> {
          const entryId = store.entryId();
          return entryId
            ? Promise.all([loadEntry(entryId), loadVersions(entryId)]).then(() => undefined)
            : Promise.resolve();
        },

        loadVersions(): Promise<void> {
          const entryId = store.entryId();
          return entryId ? loadVersions(entryId) : Promise.resolve();
        },
      };
    },
  ),
  withHooks((store, session = inject(SessionStore)) => ({
    onInit(): void {
      // Déconnexion ou autre compte : les brouillons cliniques ne restent pas en mémoire.
      effect(() => {
        const owner = session.me()?.id ?? null;
        untracked(() => {
          if (store.ownerId() !== null && store.ownerId() !== owner) {
            patchState(store, { ...initialState, ownerId: owner });
          }
        });
      });
    },
  })),
);
