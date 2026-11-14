import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { SessionStore } from '../auth';
import { ApiProblem, asProblem } from '../http/api-problem';
import { SubjectVocabulary } from '../i18n';
import { ThemeService } from '../theme';
import { PreferencesApi } from './data/preferences.api';
import { LocaleNavigator } from './locale-navigator';
import { PreferencesCache } from './preferences.cache';
import { defaultPreferences, PreferenceKey, Preferences } from './preferences.model';

/** D'où viennent les valeurs affichées : défauts (rien de connu), cache local, serveur. */
export type PreferencesSource = 'defaults' | 'cache' | 'server';

export type PreferencesStatus = 'idle' | 'loading' | 'error';

interface PreferencesState {
  /** Les valeurs affichées : serveur, plus les modifications optimistes en cours. */
  values: Preferences;
  /** Dernière réponse du serveur : la valeur de repli quand un PATCH échoue. */
  server: Preferences | null;
  source: PreferencesSource;
  status: PreferencesStatus;
  problem: ApiProblem | null;
  /** Clés dont un PATCH est en vol (compteur par clé). */
  pending: Partial<Record<PreferenceKey, number>>;
  /** Instant du dernier enregistrement réussi (ms depuis l'époque) ; null si aucun. */
  savedAt: number | null;
}

const initialState: PreferencesState = {
  values: defaultPreferences(null),
  server: null,
  source: 'defaults',
  status: 'idle',
  problem: null,
  pending: {},
  savedAt: null,
};

/**
 * Préférences du compte (fiche 14, handbook §7 « état compte ») : une seule source pour toutes les
 * bascules (vue d'ensemble, fenêtre, timeline, thème, langue, vocabulaire, saisie).
 * - chargé au login (après SessionStore), pour un praticien seulement ;
 * - `set(key, value)` optimiste : la valeur s'affiche, PATCH en arrière-plan, repli sur la valeur
 *   serveur et ApiProblem renvoyé en cas d'erreur (l'écran affiche le toast) ;
 * - `localStorage.prefs` lu une fois au démarrage (thème et vocabulaire sans attendre le réseau),
 *   réécrit après chaque réponse, effacé à la déconnexion ;
 * - applique lui-même `theme` (ThemeService), `vocabulary.subjectLabel` (SubjectVocabulary) et,
 *   après un changement de langue ou une connexion, `locale` (rechargement sur l'autre bundle).
 */
export const PreferencesStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ values, source, pending }) => ({
    /** Vrai dès que les valeurs viennent du serveur. */
    loaded: computed(() => source() === 'server'),
    saving: computed(() => Object.values(pending()).some((count) => (count ?? 0) > 0)),
    overviewWindow: computed(() => values()['overview.window']),
    timelineGroupBy: computed(() => values()['timeline.groupBy']),
    theme: computed(() => values().theme),
    locale: computed(() => values().locale),
    subjectLabel: computed(() => values()['vocabulary.subjectLabel']),
    medicationVisible: computed(() => values()['entryTypes.medicationVisible']),
    defaultVisibility: computed(() => values()['entries.defaultVisibility']),
    defaultDurationMin: computed(() => values()['sessions.defaultDurationMin']),
  })),
  withMethods(
    (
      store,
      api = inject(PreferencesApi),
      cache = inject(PreferencesCache),
      session = inject(SessionStore),
      localeNavigator = inject(LocaleNavigator),
      theme = inject(ThemeService),
      vocabulary = inject(SubjectVocabulary),
    ) => {
      const defaults = (): Preferences => defaultPreferences(session.me()?.profession ?? null);

      /**
       * Le thème et la désignation suivent les valeurs, d'où qu'elles viennent, tout de suite
       * (aucun rechargement, fiche 14). Sans aucune source (visiteur, avant la première réponse),
       * le thème reste celui du ThemeService : la préférence système.
       */
      const applyToServices = (): void => {
        const values = store.values();
        vocabulary.set(values['vocabulary.subjectLabel']);
        theme.set(store.source() === 'defaults' ? 'system' : values.theme);
      };

      const commit = (partial: Partial<PreferencesState>): void => {
        patchState(store, partial);
        applyToServices();
      };

      /** Les valeurs serveur, en gardant les modifications optimistes encore en vol. */
      const withPending = (server: Preferences, except?: PreferenceKey): Preferences => {
        const merged: Record<string, unknown> = { ...server };
        const current = store.values() as unknown as Record<string, unknown>;
        for (const [key, count] of Object.entries(store.pending())) {
          if (key !== except && (count ?? 0) > 0) merged[key] = current[key];
        }
        return merged as unknown as Preferences;
      };

      const bump = (key: PreferenceKey, delta: number): void => {
        const pending = { ...store.pending() };
        const next = (pending[key] ?? 0) + delta;
        if (next > 0) pending[key] = next;
        else delete pending[key];
        patchState(store, { pending });
      };

      // Numéro d'ordre des requêtes : une réponse plus ancienne que la dernière appliquée est un
      // succès, mais ses valeurs (déjà dépassées) ne remplacent pas les plus récentes.
      let sequence = 0;
      let applied = 0;

      const acceptServer = (
        seq: number,
        server: Preferences,
        except?: PreferenceKey,
        extra: Partial<PreferencesState> = {},
      ): void => {
        if (seq <= applied) return;
        applied = seq;
        commit({ values: withPending(server, except), server, source: 'server', ...extra });
        cache.write(server);
      };

      return {
        /** Applique les valeurs du cache local, s'il y en a (une fois, au démarrage). */
        restoreFromCache(): void {
          const cached = cache.read();
          if (cached) commit({ values: cached, source: 'cache' });
        },

        /**
         * GET /api/me/preferences. Ne rejette jamais : en erreur, les valeurs affichées restent
         * (cache ou défauts) et `problem` est posé. `followLocale` : recharger l'application dans
         * la langue du compte si elle diffère du bundle courant (après une connexion).
         */
        async load(options: { followLocale?: boolean } = {}): Promise<void> {
          const seq = ++sequence;
          patchState(store, { status: 'loading', problem: null });
          try {
            const server = await api.get(defaults());
            acceptServer(seq, server, undefined, { status: 'idle' });
            if (store.status() === 'loading') patchState(store, { status: 'idle' });
            if (options.followLocale) localeNavigator.goTo(server.locale);
          } catch (error) {
            patchState(store, { status: 'error', problem: asProblem(error) });
          }
        },

        /**
         * Modification optimiste d'une clé : affichée tout de suite, PATCH {clé: valeur} en
         * arrière-plan, les autres clés conservées par le serveur (merge-patch). En erreur, la clé
         * revient à sa valeur serveur (ou au défaut) et l'ApiProblem est renvoyé ; null sinon.
         * Le client ne vérifie que la forme : une valeur hors domaine est jugée par le serveur (422).
         */
        async set<K extends PreferenceKey>(
          key: K,
          value: Preferences[K],
        ): Promise<ApiProblem | null> {
          const seq = ++sequence;
          commit({ values: { ...store.values(), [key]: value }, problem: null });
          bump(key, 1);
          try {
            const server = await api.patch({ [key]: value } as Partial<Preferences>, defaults());
            bump(key, -1);
            acceptServer(seq, server, key, { savedAt: Date.now() });
            if (store.savedAt() === null) patchState(store, { savedAt: Date.now() });
            if (key === 'locale') localeNavigator.goTo(server.locale);
            return null;
          } catch (error) {
            bump(key, -1);
            const problem = asProblem(error);
            if (!store.pending()[key]) {
              const fallback = (store.server() ?? defaults())[key];
              commit({ values: { ...store.values(), [key]: fallback } });
            }
            return problem;
          }
        },

        /** Déconnexion : retour aux défauts, cache effacé (le prochain compte ne doit rien hériter). */
        reset(): void {
          commit({ ...initialState, values: defaultPreferences(null) });
          cache.clear();
        },
      };
    },
  ),
  withHooks({
    onInit(store) {
      const session = inject(SessionStore);
      store.restoreFromCache();

      // Chargement au login, après SessionStore : praticien connecté → load() ; sinon reset().
      // Une connexion depuis l'état « sans session » (page de connexion) suit la langue du compte ;
      // un démarrage avec session déjà ouverte garde le bundle de l'URL.
      let sawAnonymous = false;
      effect(() => {
        const status = session.status();
        const me = session.me();
        if (status === 'loading') return;
        untracked(() => {
          if (me && me.role === 'practitioner') {
            const followLocale = sawAnonymous;
            sawAnonymous = false;
            void store.load({ followLocale });
          } else {
            sawAnonymous = true;
            if (store.source() !== 'defaults' || store.server() !== null) store.reset();
          }
        });
      });
    },
  }),
);
