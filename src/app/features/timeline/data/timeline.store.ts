import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { TimelineFiltersStore } from './timeline-filters.store';
import { TimelineApi } from './timeline.api';
import {
  buildRows,
  EmotionFamily,
  layoutBands,
  MAX_WINDOWS,
  neighbourhood,
  TimelineFacets,
  TimelineItem,
  TimelinePage,
  TimelineSnapshot,
  TimelineWindow,
  TimelineZoom,
  WINDOW_SIZE,
  windowCount,
  windowOfSlot,
  windowOffset,
  ZOOM_LEVELS,
} from './timeline.model';

/** idle | loading (première fenêtre) | loaded | error (première fenêtre en échec, rien à montrer). */
export type TimelineStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface TimelineState {
  patientId: string | null;
  status: TimelineStatus;
  problem: ApiProblem | null;
  /** Nombre d'éléments de toute la plage filtrée (somme de facets.types) : le nombre de créneaux. */
  total: number;
  facets: TimelineFacets;
  /** Situations qui chevauchent la plage (bandes), indépendantes de la pagination. */
  ongoing: TimelineItem[];
  /** Curseur de chaque fenêtre : trail[k] demande la fenêtre k (trail[0] = null, première page). */
  trail: (string | null)[];
  /** Taille de chaque fenêtre déjà lue (les autres valent WINDOW_SIZE). */
  sizes: number[];
  /** Indice de la dernière fenêtre, une fois atteinte (nextCursor null). */
  lastIndex: number | null;
  /** Les fenêtres en mémoire : trois au plus, autour de la courante. */
  windows: TimelineWindow[];
  /** Fenêtre qui contient le haut de la zone visible. */
  current: number;
  zoom: TimelineZoom;
  /** Premier créneau visible : la position de défilement, rangée dans le shell. */
  anchor: number;
  /** Index des séances (identifiant → début), pour la pastille, le début du suivi, le mode par séance. */
  sessions: Record<string, string>;
  /** L'index des séances a répondu (ou échoué) : le mode par séance peut regrouper sans attendre plus. */
  sessionsReady: boolean;
  /** Début déclaré du suivi (en-tête patient : followUp.since, sinon création du dossier). */
  followedSince: string | null;
  emotionLabels: Record<string, string>;
  emotionFamilies: Record<string, EmotionFamily>;
  /** Dernière carte ouverte (bordure primaire). */
  selectedId: string | null;
}

const emptyFacets: TimelineFacets = { types: {}, emotions: {}, tags: {} };

const initialState: TimelineState = {
  patientId: null,
  status: 'idle',
  problem: null,
  total: 0,
  facets: emptyFacets,
  ongoing: [],
  trail: [null],
  sizes: [],
  lastIndex: null,
  windows: [],
  current: 0,
  zoom: 'week',
  anchor: 0,
  sessions: {},
  sessionsReady: false,
  followedSince: null,
  emotionLabels: {},
  emotionFamilies: {},
  selectedId: null,
};

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

/**
 * La chronologie d'un patient en mode chronologique (fiche 03, état A ; A6) : fenêtres de
 * WINDOW_SIZE éléments lues par curseur keyset, trois au plus en mémoire (précédente, courante,
 * suivante), le reste représenté par des créneaux vides dont le nombre vient des facettes. Le zoom
 * ne change que la granularité d'affichage : il ne demande rien tant que les fenêtres en mémoire
 * couvrent la zone visible. Fourni par la page de l'onglet ; son état est rangé dans le
 * PatientShellStore (rememberTab) quand on quitte l'onglet, et repris au retour.
 */
export const TimelineStore = signalStore(
  withState(initialState),
  withComputed((store, filters = inject(TimelineFiltersStore)) => {
    // Début du suivi du contrat (followedSince : followUp.since, sinon création du dossier).
    const followStart = computed(() => store.followedSince());
    const bands = computed(() => layoutBands(store.ongoing()));
    return {
      /**
       * Mode par séance (M3-03), dérivé du mode du TimelineFiltersStore (jamais copié) : les
       * fenêtres en mémoire sont les trois premières (les plus récentes), quelle que soit la
       * position de défilement ; le regroupement porte sur elles.
       */
      headOnly: computed(() => filters.mode() === 'session'),
      followStart,
      bands,
      count: computed(() => windowCount(store.total(), store.sizes())),
      /** Fenêtres réellement en mémoire (chargées). */
      inMemory: computed(() => store.windows().filter((w) => w.status === 'loaded').length),
      rows: computed(() =>
        buildRows({
          total: store.total(),
          sizes: store.sizes(),
          windows: store.windows(),
          zoom: store.zoom(),
          sessions: store.sessions(),
          followStart: followStart(),
          bands: bands(),
        }),
      ),
      /** Bornes (plus récent, plus ancien) des éléments de la fenêtre courante. */
      currentBounds: computed(() => {
        const win = store.windows().find((w) => w.index === store.current());
        const items = win?.status === 'loaded' ? win.items : [];
        if (!items.length) return null;
        return { newest: items[0].occurred, oldest: items[items.length - 1].occurred };
      }),
      /**
       * Les éléments des premières fenêtres (MAX_WINDOWS au plus), pour le mode par séance : prêts
       * quand toutes sont chargées ; `complete` si elles couvrent toute la plage filtrée.
       */
      head: computed(() => {
        const count = windowCount(store.total(), store.sizes());
        const wanted = Math.min(MAX_WINDOWS, count);
        const windows = store.windows().filter((w) => w.index < wanted);
        const loaded = windows.filter((w) => w.status === 'loaded');
        return {
          items: loaded.sort((a, b) => a.index - b.index).flatMap((w) => w.items),
          ready: loaded.length === wanted,
          complete: (store.lastIndex() ?? MAX_WINDOWS) < MAX_WINDOWS,
          failed: windows.find((w) => w.status === 'error') ?? null,
        };
      }),
      canZoomIn: computed(() => ZOOM_LEVELS.indexOf(store.zoom()) > 0),
      canZoomOut: computed(() => ZOOM_LEVELS.indexOf(store.zoom()) < ZOOM_LEVELS.length - 1),
    };
  }),
  withMethods((store, api = inject(TimelineApi), filters = inject(TimelineFiltersStore)) => {
    /** Change à chaque (re)chargement : une réponse d'une génération passée est ignorée. */
    let generation = 0;
    /** Requêtes en vol par fenêtre (jamais deux fois la même). */
    const inflight = new Map<number, Promise<void>>();

    function query(cursor: string | null) {
      return { ...filters.query(), cursor, limit: WINDOW_SIZE };
    }

    /** La fenêtre courante après un (re)chargement : la deuxième en mode par séance (0, 1, 2 en mémoire). */
    function home(): number {
      return store.headOnly() ? Math.min(1, Math.max(0, store.count() - 1)) : store.current();
    }

    function setWindow(win: TimelineWindow): void {
      const others = store.windows().filter((w) => w.index !== win.index);
      patchState(store, { windows: [...others, win].sort((a, b) => a.index - b.index) });
    }

    /** Garde les fenêtres voisines de la courante, et trois au plus (les plus proches). */
    function evict(): void {
      const current = store.current();
      const wanted = new Set(neighbourhood(current, Math.max(store.count(), current + 1)));
      let kept = store.windows().filter((w) => wanted.has(w.index));
      if (kept.length > MAX_WINDOWS) {
        kept = [...kept]
          .sort((a, b) => Math.abs(a.index - current) - Math.abs(b.index - current))
          .slice(0, MAX_WINDOWS)
          .sort((a, b) => a.index - b.index);
      }
      if (kept.length !== store.windows().length) patchState(store, { windows: kept });
    }

    /** Enregistre ce qu'une page apprend : taille, curseur suivant, fin de liste, total. */
    function learn(k: number, page: TimelinePage): void {
      const sizes = [...store.sizes()];
      sizes[k] = page.items.length;
      const trail = [...store.trail()];
      trail[k + 1] = page.nextCursor;
      const patch: Partial<TimelineState> = { sizes, trail };
      // Facettes en retard sur les pages (écriture entre deux lectures) : il reste au moins un
      // élément après cette page, le total ne doit pas couper la liste avant lui.
      const end = windowOffset(k, sizes) + page.items.length;
      if (page.nextCursor !== null && end >= store.total()) patch.total = end + 1;
      if (page.nextCursor === null) {
        patch.lastIndex = k;
        trail.length = k + 1;
        sizes.length = k + 1;
        patch.total = windowOffset(k, sizes) + page.items.length;
      }
      patchState(store, patch);
    }

    /** Lit la page k (après les k-1 précédentes si leur curseur n'est pas encore connu). */
    function fetchWindow(k: number, gen: number): Promise<void> {
      const pending = inflight.get(k);
      if (pending) return pending;
      const run = (async () => {
        if (store.trail().length <= k) {
          // Curseur inconnu (saut lointain) : on parcourt les pages intermédiaires, sans les garder.
          await fetchWindow(k - 1, gen);
          if (gen !== generation || store.trail().length <= k) return;
        }
        const cursor = store.trail()[k] ?? null;
        if (k > 0 && cursor === null) return; // au-delà de la dernière page
        const id = store.patientId();
        if (!id) return;
        const wanted = () => neighbourhood(store.current(), store.count()).includes(k);
        if (wanted()) {
          const previous = store.windows().find((w) => w.index === k);
          setWindow({ index: k, status: 'loading', items: previous?.items ?? [], problem: null });
        }
        try {
          const page = await api.page(id, query(cursor));
          if (gen !== generation) return;
          learn(k, page);
          if (wanted()) {
            setWindow({ index: k, status: 'loaded', items: page.items, problem: null });
            evict();
          }
        } catch (error) {
          if (gen !== generation) return;
          if (wanted()) {
            setWindow({ index: k, status: 'error', items: [], problem: asProblem(error) });
          }
        }
      })().finally(() => inflight.delete(k));
      inflight.set(k, run);
      return run;
    }

    /** La fenêtre k devient la courante : ses voisines se chargent, les autres quittent la mémoire. */
    function focus(k: number): void {
      const count = store.count();
      if (!count) return;
      const current = Math.max(0, Math.min(k, count - 1));
      if (current !== store.current()) patchState(store, { current });
      evict();
      const gen = generation;
      // La courante d'abord, puis les adjacentes en arrière-plan.
      const order = [current, current + 1, current - 1].filter((i) => i >= 0 && i < count);
      for (const index of order) {
        const win = store.windows().find((w) => w.index === index);
        if (!win) void fetchWindow(index, gen);
      }
    }

    /** Première fenêtre : total, facettes, situations ; puis la suivante en arrière-plan. */
    async function loadFirst(gen: number): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      try {
        const page = await api.page(id, query(null));
        if (gen !== generation) return;
        const total = Math.max(
          sum(page.facets.types),
          page.items.length + (page.nextCursor ? 1 : 0),
        );
        patchState(store, {
          status: 'loaded',
          problem: null,
          facets: page.facets,
          ongoing: page.ongoingSituations,
          total,
          sizes: [page.items.length],
          trail: [null, page.nextCursor],
          lastIndex: page.nextCursor === null ? 0 : null,
          windows: [{ index: 0, status: 'loaded', items: page.items, problem: null }],
        });
        if (page.nextCursor === null)
          patchState(store, { total: page.items.length, trail: [null] });
        focus(home());
      } catch (error) {
        if (gen !== generation) return;
        patchState(store, { status: 'error', problem: asProblem(error) });
      }
    }

    /** Index des séances et noms d'émotions : utiles mais jamais bloquants. */
    async function loadSide(gen: number): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      const [sessions, vocabulary] = await Promise.allSettled([
        api.sessions(id),
        Object.keys(store.emotionLabels()).length
          ? Promise.resolve({ labels: store.emotionLabels(), families: store.emotionFamilies() })
          : api.emotions(),
      ]);
      if (gen !== generation) return;
      if (sessions.status === 'fulfilled') patchState(store, { sessions: sessions.value });
      if (vocabulary.status === 'fulfilled')
        patchState(store, {
          emotionLabels: vocabulary.value.labels,
          emotionFamilies: vocabulary.value.families,
        });
      patchState(store, { sessionsReady: true });
    }

    function setZoom(zoom: TimelineZoom): void {
      if (zoom !== store.zoom()) patchState(store, { zoom });
    }

    return {
      /**
       * Ouvre la chronologie du patient. Avec l'état rangé au départ précédent (même patient), il
       * est repris tel quel (fenêtres, zoom, position) puis relu en arrière-plan.
       */
      async load(
        patientId: string,
        followedSince: string | null,
        snapshot?: TimelineSnapshot,
      ): Promise<void> {
        generation++;
        inflight.clear();
        const gen = generation;
        if (snapshot && snapshot.patientId === patientId) {
          patchState(store, {
            ...initialState,
            ...snapshot,
            windows: snapshot.windows.filter((w) => w.status === 'loaded'),
            current: windowOfSlot(snapshot.anchor, snapshot.sizes),
            sessionsReady: true,
            followedSince,
            status: 'loaded',
          });
          await refresh();
          return;
        }
        patchState(store, {
          ...initialState,
          zoom: snapshot?.zoom ?? initialState.zoom,
          patientId,
          followedSince,
          status: 'loading',
        });
        await Promise.all([loadFirst(gen), loadSide(gen)]);
      },

      /**
       * Les filtres ont changé (TimelineFiltersStore) : la plage filtrée est relue depuis la première
       * page (total, facettes, situations), la position revient en haut ; zoom, index des séances et
       * noms d'émotions restent.
       */
      async applyFilters(): Promise<void> {
        const id = store.patientId();
        if (!id) return;
        generation++;
        inflight.clear();
        patchState(store, {
          status: 'loading',
          problem: null,
          total: 0,
          facets: emptyFacets,
          ongoing: [],
          trail: [null],
          sizes: [],
          lastIndex: null,
          windows: [],
          current: 0,
          anchor: 0,
        });
        await loadFirst(generation);
      },

      /**
       * Passage en mode par séance (withHooks) : les trois premières fenêtres reviennent en mémoire,
       * la fenêtre courante ne suit plus le défilement.
       */
      focusHead(): void {
        if (store.headOnly() && store.status() === 'loaded') focus(home());
      },

      /** Réessayer après l'échec de la première fenêtre. */
      async reload(): Promise<void> {
        const id = store.patientId();
        if (!id) return;
        generation++;
        inflight.clear();
        patchState(store, { status: 'loading', problem: null });
        await Promise.all([loadFirst(generation), loadSide(generation)]);
      },

      /**
       * La zone visible va du créneau `first` au créneau `last` : la fenêtre du haut devient la
       * courante (ses voisines se chargent si besoin, les autres sortent de la mémoire).
       */
      visible(first: number, last: number): void {
        if (store.status() !== 'loaded' || store.headOnly()) return;
        const total = store.total();
        if (!total) return;
        const top = Math.max(0, Math.min(first, total - 1));
        const bottom = Math.max(top, Math.min(last, total - 1));
        if (top !== store.anchor()) patchState(store, { anchor: top });
        // Le centre de la zone visible désigne la fenêtre courante (une fenêtre compte bien plus de
        // lignes qu'un écran : la zone ne touche jamais que la courante et une voisine).
        focus(windowOfSlot(Math.floor((top + bottom) / 2), store.sizes()));
      },

      /** Réessayer une fenêtre en échec ; les autres restent affichées. */
      retryWindow(k: number): Promise<void> {
        return fetchWindow(k, generation);
      },

      zoomIn(): void {
        const i = ZOOM_LEVELS.indexOf(store.zoom());
        if (i > 0) setZoom(ZOOM_LEVELS[i - 1]);
      },

      zoomOut(): void {
        const i = ZOOM_LEVELS.indexOf(store.zoom());
        if (i < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[i + 1]);
      },

      setZoom,

      select(id: string | null): void {
        patchState(store, { selectedId: id });
      },

      /**
       * Relit les projections après une écriture ; `side: false` garde l'index des séances et le
       * vocabulaire (un lien ne les change pas).
       */
      refresh,

      /**
       * Trouve le créneau d'une entrée (`?focus=<id>`, recherche → timeline) : les fenêtres sont lues
       * dans l'ordre du curseur jusqu'à elle ; celle qui la contient devient la courante (trois
       * fenêtres au plus restent en mémoire). Null si l'entrée n'est pas dans la plage.
       */
      async locate(id: string): Promise<number | null> {
        const gen = generation;
        for (let k = 0; store.status() === 'loaded' && k < store.count(); k++) {
          let win = store.windows().find((w) => w.index === k && w.status === 'loaded');
          if (!win) {
            patchState(store, { current: k });
            await fetchWindow(k, gen);
            if (gen !== generation) return null;
            win = store.windows().find((w) => w.index === k && w.status === 'loaded');
            if (!win) return null;
          }
          const i = win.items.findIndex((item) => item.id === id);
          if (i >= 0) {
            const slot = windowOffset(k, store.sizes()) + i;
            patchState(store, { selectedId: id, anchor: slot });
            focus(k);
            return slot;
          }
        }
        return null;
      },

      /** L'état à ranger dans le shell (rememberTab) : fenêtres chargées, zoom, position. */
      snapshot(): TimelineSnapshot | null {
        const patientId = store.patientId();
        if (!patientId || store.status() !== 'loaded') return null;
        return {
          patientId,
          total: store.total(),
          facets: store.facets(),
          ongoing: store.ongoing(),
          trail: store.trail(),
          sizes: store.sizes(),
          lastIndex: store.lastIndex(),
          windows: store.windows().filter((w) => w.status === 'loaded'),
          zoom: store.zoom(),
          anchor: store.anchor(),
          sessions: store.sessions(),
          emotionLabels: store.emotionLabels(),
          emotionFamilies: store.emotionFamilies(),
          selectedId: store.selectedId(),
        };
      },
    };

    /**
     * Relit les projections après une écriture (CLAUDE.md : on relit, on ne recalcule pas) : la
     * première page (total, facettes, situations) puis les fenêtres en mémoire, sans vider l'écran.
     */
    async function refresh(options: { side?: boolean } = {}): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      generation++;
      inflight.clear();
      const gen = generation;
      try {
        const first = await api.page(id, query(null));
        if (gen !== generation) return;
        // Même suite de pages (premier curseur inchangé) : les curseurs déjà lus restent valables,
        // chaque fenêtre en mémoire est relue directement. Sinon, on repart de la première page.
        const same = first.nextCursor !== null && first.nextCursor === store.trail()[1];
        const sizes = same ? [...store.sizes()] : [];
        sizes[0] = first.items.length;
        patchState(store, {
          facets: first.facets,
          ongoing: first.ongoingSituations,
          total: Math.max(sum(first.facets.types), first.items.length + (first.nextCursor ? 1 : 0)),
          sizes,
          trail: same ? store.trail() : [null, first.nextCursor],
          lastIndex: same ? store.lastIndex() : first.nextCursor === null ? 0 : null,
        });
        if (first.nextCursor === null)
          patchState(store, {
            total: first.items.length,
            trail: [null],
            sizes: [first.items.length],
          });
        const others = store.windows().filter((w) => w.index !== 0);
        const keepFirst = neighbourhood(store.current(), store.count()).includes(0);
        patchState(store, {
          windows: keepFirst
            ? [{ index: 0, status: 'loaded', items: first.items, problem: null }, ...others]
            : others,
        });
        // Les autres fenêtres : relues dans l'ordre (chaque curseur vient de la page précédente).
        for (const win of others) {
          if (gen !== generation) return;
          await fetchWindow(win.index, gen);
        }
        focus(home());
      } catch (error) {
        if (gen !== generation) return;
        // L'écran garde ce qu'il montre ; l'échec ne touche que la relecture.
        void error;
      }
      if (options.side !== false) void loadSide(gen);
    }
  }),
  withHooks({
    onInit(store) {
      // Le mode passe à « par séance » : on recentre sur les trois premières fenêtres.
      effect(() => {
        if (store.headOnly()) untracked(() => store.focusHead());
      });
    },
  }),
);

export type TimelineStore = InstanceType<typeof TimelineStore>;
