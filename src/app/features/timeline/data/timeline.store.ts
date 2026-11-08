import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { TimelineApi } from './timeline.api';
import {
  buildRows,
  followUpStart,
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
  /** Index des séances (identifiant → début), pour la pastille et le début du suivi. */
  sessions: Record<string, string>;
  /** Début déclaré du suivi (en-tête patient : followUp.since, sinon création du dossier). */
  followedSince: string | null;
  emotionLabels: Record<string, string>;
  /** Dernière carte ouverte (bordure primaire). */
  selectedId: string | null;
  /** Bornes de la plage (période, M3-03) ; null = sans borne. */
  from: string | null;
  to: string | null;
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
  followedSince: null,
  emotionLabels: {},
  selectedId: null,
  from: null,
  to: null,
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
  withComputed((store) => {
    const followStart = computed(() => followUpStart(store.followedSince(), store.sessions()));
    const bands = computed(() => layoutBands(store.ongoing()));
    return {
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
      canZoomIn: computed(() => ZOOM_LEVELS.indexOf(store.zoom()) > 0),
      canZoomOut: computed(() => ZOOM_LEVELS.indexOf(store.zoom()) < ZOOM_LEVELS.length - 1),
    };
  }),
  withMethods((store, api = inject(TimelineApi)) => {
    /** Change à chaque (re)chargement : une réponse d'une génération passée est ignorée. */
    let generation = 0;
    /** Requêtes en vol par fenêtre (jamais deux fois la même). */
    const inflight = new Map<number, Promise<void>>();

    function query(cursor: string | null) {
      return { from: store.from(), to: store.to(), cursor, limit: WINDOW_SIZE };
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
        const total = Math.max(sum(page.facets.types), page.items.length);
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
        focus(store.current());
      } catch (error) {
        if (gen !== generation) return;
        patchState(store, { status: 'error', problem: asProblem(error) });
      }
    }

    /** Index des séances et noms d'émotions : utiles mais jamais bloquants. */
    async function loadSide(gen: number): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      const [sessions, labels] = await Promise.allSettled([
        api.sessions(id),
        Object.keys(store.emotionLabels()).length
          ? Promise.resolve(store.emotionLabels())
          : api.emotionLabels(),
      ]);
      if (gen !== generation) return;
      if (sessions.status === 'fulfilled') patchState(store, { sessions: sessions.value });
      if (labels.status === 'fulfilled') patchState(store, { emotionLabels: labels.value });
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
        if (store.status() !== 'loaded') return;
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

      refresh,

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
          selectedId: store.selectedId(),
        };
      },
    };

    /**
     * Relit les projections après une écriture (CLAUDE.md : on relit, on ne recalcule pas) : la
     * première page (total, facettes, situations) puis les fenêtres en mémoire, sans vider l'écran.
     */
    async function refresh(): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      generation++;
      inflight.clear();
      const gen = generation;
      try {
        const first = await api.page(id, query(null));
        if (gen !== generation) return;
        patchState(store, {
          facets: first.facets,
          ongoing: first.ongoingSituations,
          total: Math.max(sum(first.facets.types), first.items.length),
          sizes: [first.items.length],
          trail: [null, first.nextCursor],
          lastIndex: first.nextCursor === null ? 0 : null,
        });
        if (first.nextCursor === null)
          patchState(store, { total: first.items.length, trail: [null] });
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
        focus(store.current());
      } catch (error) {
        if (gen !== generation) return;
        // L'écran garde ce qu'il montre ; l'échec ne touche que la relecture.
        void error;
      }
      void loadSide(gen);
    }
  }),
);

export type TimelineStore = InstanceType<typeof TimelineStore>;
