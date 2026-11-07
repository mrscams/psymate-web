import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../auth';
import { SessionApi } from '../auth/data/session.api';
import { SubjectVocabulary } from '../i18n';
import { ThemeService } from '../theme';
import { PreferencesApi } from './data/preferences.api';
import { LocaleNavigator } from './locale-navigator';
import { PREFERENCES_CACHE_KEY } from './preferences.cache';
import { defaultPreferences, Preferences } from './preferences.model';
import { PreferencesStore } from './preferences.store';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

const serverPrefs: Preferences = {
  ...defaultPreferences('psychologist'),
  theme: 'dark',
  'overview.window': '30d',
  'sessions.defaultDurationMin': 45,
};

/** Simule le merge-patch du serveur : la réponse contient toutes les clés, les autres inchangées. */
function fakeServer(initial: Preferences) {
  let state = { ...initial };
  return {
    get: vi.fn(async () => ({ ...state })),
    patch: vi.fn(async (changes: Partial<Preferences>) => {
      state = { ...state, ...changes };
      return { ...state };
    }),
    current: () => state,
  };
}

interface SetupOptions {
  api?: { get: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  /** Le SessionStore est déjà en train de charger (démarrage avec cookie). */
  sessionLoading?: boolean;
}

function setup(options: SetupOptions = {}) {
  const api = options.api ?? fakeServer(serverPrefs);
  const navigator = { current: 'fr', goTo: vi.fn() };
  // Démarrage avec cookie : GET /api/auth/me est en cours quand le store des préférences s'installe.
  let resolveMe: ((user: SessionUser) => void) | null = null;
  const sessionApi = {
    me: vi.fn(() => new Promise<SessionUser>((resolve) => (resolveMe = resolve))),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PreferencesApi, useValue: api },
      { provide: SessionApi, useValue: sessionApi },
      { provide: LocaleNavigator, useValue: navigator },
    ],
  });
  const session = TestBed.inject(SessionStore);
  if (options.sessionLoading) void session.load();
  const store = TestBed.inject(PreferencesStore);
  TestBed.tick();
  return {
    store,
    session,
    api,
    navigator,
    theme: TestBed.inject(ThemeService),
    vocabulary: TestBed.inject(SubjectVocabulary),
    /** Le compte arrive : par la connexion (page de connexion) ou par la réponse de GET /api/auth/me. */
    async arrive(user = claire): Promise<void> {
      if (resolveMe) resolveMe(user);
      else session.signIn(user);
      await flush();
    },
  };
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
};

describe('PreferencesStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  describe('défauts par profession (fiche 14, contrat)', () => {
    it.each([
      ['psychologist', 'patient', false],
      ['psychiatrist', 'patient', true],
      ['coach', 'client', false],
      [null, 'patient', false],
    ] as const)('%s → subjectLabel %s, medicationVisible %s', (profession, label, medication) => {
      const defaults = defaultPreferences(profession);
      expect(defaults['vocabulary.subjectLabel']).toBe(label);
      expect(defaults['entryTypes.medicationVisible']).toBe(medication);
      expect(defaults['sessions.defaultDurationMin']).toBe(60);
      expect(defaults.locale).toBe('fr');
      expect(defaults.theme).toBe('light');
      expect(defaults['overview.view']).toBe('simple');
      expect(defaults['overview.window']).toBe('90d');
      expect(defaults['timeline.groupBy']).toBe('session');
      expect(defaults['entries.defaultVisibility']).toBe('clinical');
    });
  });

  describe('cache localStorage.prefs au démarrage', () => {
    it('absent : démarre aux défauts, thème système, rien de chargé', () => {
      const { store, theme } = setup();
      expect(store.source()).toBe('defaults');
      expect(store.loaded()).toBe(false);
      expect(store.values()).toEqual(defaultPreferences(null));
      expect(theme.preference()).toBe('system');
    });

    it.each(['{{{', '[1,2]', '"texte"', 'null', '42'])(
      'corrompu (%s) : ignoré, l’application démarre',
      (text) => {
        localStorage.setItem(PREFERENCES_CACHE_KEY, text);
        const { store } = setup();
        expect(store.source()).toBe('defaults');
        expect(store.values()).toEqual(defaultPreferences(null));
      },
    );

    it('valide : thème et vocabulaire appliqués avant toute réponse réseau', () => {
      localStorage.setItem(
        PREFERENCES_CACHE_KEY,
        JSON.stringify({ theme: 'dark', 'vocabulary.subjectLabel': 'client', inconnue: 1 }),
      );
      const { store, theme, vocabulary } = setup({ sessionLoading: true });
      expect(store.source()).toBe('cache');
      expect(theme.preference()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(vocabulary.label()).toBe('client');
      // Les clés absentes du cache valent le défaut, la clé inconnue n'existe pas.
      expect(store.defaultDurationMin()).toBe(60);
      expect('inconnue' in store.values()).toBe(false);
    });

    it('valeur hors domaine dans le cache : la clé prend son défaut', () => {
      localStorage.setItem(
        PREFERENCES_CACHE_KEY,
        JSON.stringify({ theme: 'violet', 'sessions.defaultDurationMin': 999 }),
      );
      const { store } = setup({ sessionLoading: true });
      expect(store.theme()).toBe('light');
      expect(store.defaultDurationMin()).toBe(60);
    });
  });

  describe('chargement au login', () => {
    it('praticien connecté : GET, valeurs serveur, cache écrit, thème appliqué', async () => {
      const { store, arrive, api, theme } = setup();
      await arrive();
      expect(api.get).toHaveBeenCalledOnce();
      expect(store.loaded()).toBe(true);
      expect(store.values()).toEqual(serverPrefs);
      expect(theme.preference()).toBe('dark');
      expect(JSON.parse(localStorage.getItem(PREFERENCES_CACHE_KEY) ?? '{}')).toEqual(serverPrefs);
    });

    it('coach : subjectLabel « client » et type médicament masqué sans action', async () => {
      const coachPrefs = defaultPreferences('coach');
      const { store, arrive, vocabulary } = setup({ api: fakeServer(coachPrefs) });
      await arrive({ ...claire, profession: 'coach' });
      expect(store.subjectLabel()).toBe('client');
      expect(store.medicationVisible()).toBe(false);
      expect(vocabulary.label()).toBe('client');
    });

    it('administrateur : aucun appel', async () => {
      const { store, arrive, api } = setup();
      await arrive({ ...claire, role: 'admin' });
      expect(api.get).not.toHaveBeenCalled();
      expect(store.loaded()).toBe(false);
    });

    it('GET en erreur : status error, les valeurs précédentes restent, ne rejette pas', async () => {
      localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify({ theme: 'soft' }));
      const api = {
        get: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
        patch: vi.fn(),
      };
      const { store, arrive } = setup({ api, sessionLoading: true });
      await arrive();
      expect(store.status()).toBe('error');
      expect(store.problem()).toEqual({ status: 500, code: 'INTERNAL_ERROR' });
      expect(store.theme()).toBe('soft');
      expect(store.loaded()).toBe(false);
    });

    it('connexion depuis la page de connexion : suit la langue du compte', async () => {
      const { arrive, navigator } = setup({
        api: fakeServer({ ...serverPrefs, locale: 'en' }),
      });
      await arrive();
      expect(navigator.goTo).toHaveBeenCalledWith('en');
    });

    it('démarrage avec une session déjà ouverte : garde le bundle de l’URL', async () => {
      const { arrive, navigator } = setup({
        api: fakeServer({ ...serverPrefs, locale: 'en' }),
        sessionLoading: true,
      });
      await arrive();
      expect(navigator.goTo).not.toHaveBeenCalled();
    });
  });

  describe('set(key, value) : optimiste, PATCH partiel, repli', () => {
    it('la valeur s’affiche tout de suite et PATCH ne porte que la clé modifiée', async () => {
      const { store, arrive, api } = setup();
      await arrive();
      const promise = store.set('overview.view', 'complete');
      expect(store.overviewView()).toBe('complete');
      expect(store.saving()).toBe(true);
      expect(await promise).toBeNull();
      expect(api.patch).toHaveBeenCalledWith({ 'overview.view': 'complete' }, expect.anything());
      expect(store.saving()).toBe(false);
      expect(store.savedAt()).not.toBeNull();
    });

    it('un PATCH partiel conserve les autres clés', async () => {
      const api = fakeServer(serverPrefs);
      const { store, arrive } = setup({ api });
      await arrive();
      await store.set('theme', 'soft');
      await store.set('entryTypes.medicationVisible', true);
      expect(store.values()).toEqual({
        ...serverPrefs,
        theme: 'soft',
        'entryTypes.medicationVisible': true,
      });
      expect(store.overviewWindow()).toBe('30d');
      expect(store.defaultDurationMin()).toBe(45);
      expect(JSON.parse(localStorage.getItem(PREFERENCES_CACHE_KEY) ?? '{}')).toEqual(
        api.current(),
      );
    });

    it('thème : appliqué sans rechargement, avant la réponse du serveur', async () => {
      const { store, arrive, theme } = setup();
      await arrive();
      const promise = store.set('theme', 'light');
      expect(theme.preference()).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      await promise;
    });

    it('erreur du PATCH : la clé revient à la valeur serveur et le problème est renvoyé', async () => {
      const api = fakeServer(serverPrefs);
      api.patch.mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'sessions.defaultDurationMin', code: 'INVALID_VALUE', message: '' }],
      });
      const { store, arrive } = setup({ api });
      await arrive();
      const promise = store.set('sessions.defaultDurationMin', 999);
      expect(store.defaultDurationMin()).toBe(999);
      const problem = await promise;
      expect(problem?.status).toBe(422);
      expect(problem?.errors?.[0].field).toBe('sessions.defaultDurationMin');
      expect(store.defaultDurationMin()).toBe(45);
      expect(store.saving()).toBe(false);
    });

    it('erreur sans valeur serveur connue : repli sur le défaut', async () => {
      const api = {
        get: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
        patch: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
      };
      const { store, arrive } = setup({ api });
      await arrive();
      await store.set('theme', 'dark');
      expect(store.theme()).toBe('light');
    });

    it('deux PATCH en vol : la réponse du premier n’écrase pas la clé encore en attente', async () => {
      let resolveFirst!: (value: Preferences) => void;
      const api = {
        get: vi.fn(async () => ({ ...serverPrefs })),
        patch: vi
          .fn()
          .mockImplementationOnce(
            () => new Promise<Preferences>((resolve) => (resolveFirst = resolve)),
          )
          .mockImplementationOnce(async () => ({
            ...serverPrefs,
            theme: 'soft',
            'overview.view': 'complete',
          })),
      };
      const { store, arrive } = setup({ api });
      await arrive();
      const first = store.set('theme', 'soft');
      const second = store.set('overview.view', 'complete');
      await second;
      expect(store.overviewView()).toBe('complete');
      expect(store.theme()).toBe('soft');
      resolveFirst({ ...serverPrefs, theme: 'soft' });
      await first;
      expect(store.overviewView()).toBe('complete');
      expect(store.theme()).toBe('soft');
    });

    it('langue : PATCH puis rechargement dans la langue choisie', async () => {
      const { store, arrive, navigator } = setup();
      await arrive();
      await store.set('locale', 'en');
      expect(navigator.goTo).toHaveBeenCalledWith('en');
    });
  });

  describe('déconnexion', () => {
    it('retour aux défauts, cache effacé, thème système', async () => {
      const { store, session, arrive, theme, vocabulary } = setup({
        api: fakeServer({ ...serverPrefs, 'vocabulary.subjectLabel': 'client' }),
      });
      await arrive();
      expect(localStorage.getItem(PREFERENCES_CACHE_KEY)).not.toBeNull();
      session.clear();
      TestBed.tick();
      expect(store.source()).toBe('defaults');
      expect(store.values()).toEqual(defaultPreferences(null));
      expect(localStorage.getItem(PREFERENCES_CACHE_KEY)).toBeNull();
      expect(theme.preference()).toBe('system');
      expect(vocabulary.label()).toBe('patient');
    });
  });
});
