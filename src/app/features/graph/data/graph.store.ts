import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { GraphApi } from './graph.api';
import {
  DEFAULT_QUERY,
  GraphNode,
  GraphPositions,
  GraphQuery,
  GraphSuperNode,
  GraphView,
  GraphViewport,
  isSuperNodeId,
  layoutKey,
  mergeExpansion,
  periodFrom,
  sameServerQuery,
  visibleView,
} from './graph.model';
import { LinkApi } from './link.api';
import { EntryLink, LinkTypeOption, SourceEntry } from './link.model';

/** Le détail d'un nœud sélectionné : l'entrée (GET /api/entries/{id}) et ses liens acceptés. */
export interface NodeDetail {
  entry: SourceEntry;
  links: EntryLink[];
}

/**
 * L'état rangé dans le shell (rememberTab) au départ de l'onglet et repris au retour (B2 : « Onglet
 * Graphe (zoom conservé) ») : la requête, le graphe reçu et ses dépliages, la sélection, le zoom et
 * les positions par racine.
 */
export interface GraphSnapshot {
  patientId: string;
  query: GraphQuery;
  graph: GraphView | null;
  expanded: string[];
  selectedId: string | null;
  viewports: Record<string, GraphViewport>;
  positions: Record<string, GraphPositions>;
}

interface GraphState {
  patientId: string | null;
  query: GraphQuery;
  graph: Loadable<GraphView>;
  /** Super-nœuds dépliés (POST …/graph/expand), redépliés après une relecture. */
  expanded: string[];
  /** Types de liens (libellés, style de trait), lus une fois. */
  catalog: Loadable<LinkTypeOption[]>;
  emotionLabels: Record<string, string>;
  /** Nœud sélectionné : une entrée (uuid) ou un super-nœud (sn:…). */
  selectedId: string | null;
  detail: Loadable<NodeDetail>;
  /** Super-nœud en cours de dépliage. */
  expandingId: string | null;
  expandProblem: ApiProblem | null;
  /** Zoom et position du canevas par racine (layoutKey). */
  viewports: Record<string, GraphViewport>;
  /** Positions des nœuds par racine : le layout ne bouge pas à chaque lien ajouté (fiche 04). */
  positions: Record<string, GraphPositions>;
}

const initialState: GraphState = {
  patientId: null,
  query: DEFAULT_QUERY,
  graph: idle(),
  expanded: [],
  catalog: idle(),
  emotionLabels: {},
  selectedId: null,
  detail: idle(),
  expandingId: null,
  expandProblem: null,
  viewports: {},
  positions: {},
};

/**
 * La vue graphe d'un dossier (fiche 04, B4 écran 4), fournie par la page : le voisinage reçu du
 * serveur (jamais recalculé ici), le filtre local des types d'entrées, la sélection et son détail,
 * le dépliage des super-nœuds, le zoom et les positions mémorisés par racine. Après une écriture
 * (lien, correction), le graphe est relu (`refresh`), le dernier graphe reste affiché pendant ce
 * temps et en cas d'erreur.
 */
export const GraphStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    key: computed(() => layoutKey(store.query())),
    /** Le graphe montré : celui reçu, filtré par types d'entrées (la racine reste). */
    view: computed<GraphView | null>(() => {
      const data = store.graph().data;
      return data ? visibleView(data, store.query().types, store.query().root) : null;
    }),
    nodeIndex: computed(() => {
      const map = new Map<string, GraphNode>();
      for (const node of store.graph().data?.nodes ?? []) map.set(node.id, node);
      return map;
    }),
  })),
  withComputed((store) => ({
    counts: computed(() => {
      const view = store.view();
      return {
        nodes: (view?.nodes.length ?? 0) + (view?.superNodes.length ?? 0),
        edges: view?.edges.length ?? 0,
      };
    }),
    selectedNode: computed(() => {
      const id = store.selectedId();
      return id ? (store.nodeIndex().get(id) ?? null) : null;
    }),
    selectedGroup: computed<GraphSuperNode | null>(() => {
      const id = store.selectedId();
      if (!id || !isSuperNodeId(id)) return null;
      return store.graph().data?.superNodes.find((group) => group.id === id) ?? null;
    }),
    rootNode: computed(() => {
      const root = store.query().root;
      return root ? (store.nodeIndex().get(root) ?? null) : null;
    }),
    currentViewport: computed(() => store.viewports()[layoutKey(store.query())] ?? null),
    currentPositions: computed(() => store.positions()[layoutKey(store.query())] ?? null),
    lineStyles: computed(() => {
      const styles: Partial<Record<string, LinkTypeOption['lineStyle']>> = {};
      for (const type of store.catalog().data ?? []) styles[type.code] = type.lineStyle;
      return styles;
    }),
  })),
  withMethods((store, api = inject(GraphApi), links = inject(LinkApi)) => {
    let graphSeq = 0;
    let detailSeq = 0;

    async function loadCatalog(force = false): Promise<void> {
      if (!force && (store.catalog().status === 'loaded' || store.catalog().status === 'loading'))
        return;
      patchState(store, { catalog: loading(store.catalog()) });
      try {
        patchState(store, { catalog: loaded(await links.linkTypes()) });
      } catch (error) {
        patchState(store, { catalog: failed(asProblem(error), store.catalog()) });
      }
    }

    async function loadEmotions(): Promise<void> {
      if (Object.keys(store.emotionLabels()).length) return;
      try {
        patchState(store, { emotionLabels: await api.emotionLabels() });
      } catch {
        // Sans libellés, le code de l'émotion s'affiche : rien de bloquant.
      }
    }

    /** Lit le graphe de la requête courante, puis redéplie les super-nœuds dépliés. */
    async function fetchGraph(): Promise<void> {
      const patientId = store.patientId();
      if (!patientId) return;
      const seq = ++graphSeq;
      const query = store.query();
      patchState(store, { graph: loading(store.graph()) });
      try {
        let view = await api.neighbourhood(patientId, {
          root: query.root,
          depth: query.depth,
          linkTypes: query.linkTypes,
          from: periodFrom(query.period, new Date()),
        });
        const expanded: string[] = [];
        for (const id of store.expanded()) {
          if (!view.superNodes.some((group) => group.id === id)) continue;
          try {
            view = mergeExpansion(view, id, await api.expand(patientId, id));
            expanded.push(id);
          } catch {
            // Le groupe reste replié ; « Déplier » le redemandera.
          }
        }
        if (seq !== graphSeq) return;
        patchState(store, { graph: loaded(view), expanded });
        const selected = store.selectedId();
        if (selected && !stillThere(view, selected)) {
          patchState(store, { selectedId: null, detail: idle() });
        }
      } catch (error) {
        if (seq !== graphSeq) return;
        patchState(store, { graph: failed(asProblem(error), store.graph()) });
      }
    }

    function stillThere(view: GraphView, id: string): boolean {
      return isSuperNodeId(id)
        ? view.superNodes.some((group) => group.id === id)
        : view.nodes.some((node) => node.id === id);
    }

    async function loadDetail(entryId: string): Promise<void> {
      const seq = ++detailSeq;
      patchState(store, { detail: loading(store.detail()) });
      try {
        const [entry, list] = await Promise.all([links.entry(entryId), links.linksOf(entryId)]);
        if (seq !== detailSeq) return;
        patchState(store, { detail: loaded({ entry, links: list }) });
      } catch (error) {
        if (seq !== detailSeq) return;
        patchState(store, { detail: failed(asProblem(error), store.detail()) });
      }
    }

    return {
      /**
       * Le graphe d'un dossier pour une requête (URL). Un autre dossier repart de zéro ; un simple
       * changement du filtre des types d'entrées ne relit rien (filtre local) ; sinon le graphe est
       * relu, le précédent restant affiché pendant la lecture.
       */
      async load(patientId: string, query: GraphQuery): Promise<void> {
        if (store.patientId() !== patientId) {
          patchState(store, { ...initialState, catalog: store.catalog(), patientId, query });
        } else if (store.graph().status !== 'idle' && sameServerQuery(store.query(), query)) {
          patchState(store, { query });
          return;
        } else {
          patchState(store, { query, expanded: [], expandProblem: null });
        }
        void loadCatalog();
        void loadEmotions();
        await fetchGraph();
      },

      /**
       * Reprend l'état rangé dans le shell au retour sur l'onglet : rien ne bouge (zoom, positions,
       * sélection), puis le graphe est relu sans être vidé (un lien posé ailleurs apparaît).
       */
      async restore(snapshot: GraphSnapshot): Promise<void> {
        patchState(store, {
          ...initialState,
          catalog: store.catalog(),
          patientId: snapshot.patientId,
          query: snapshot.query,
          graph: snapshot.graph ? loaded(snapshot.graph) : idle(),
          expanded: snapshot.expanded,
          selectedId: snapshot.selectedId,
          viewports: snapshot.viewports,
          positions: snapshot.positions,
        });
        void loadCatalog();
        void loadEmotions();
        const selected = snapshot.selectedId;
        if (selected && !isSuperNodeId(selected)) void loadDetail(selected);
        await fetchGraph();
      },

      /** Relit le graphe (après un lien, une correction) et le détail du nœud sélectionné. */
      async refresh(): Promise<void> {
        const selected = store.selectedId();
        if (selected && !isSuperNodeId(selected)) void loadDetail(selected);
        await fetchGraph();
      },

      /** « Réessayer » de l'état erreur du graphe. */
      async retry(): Promise<void> {
        await fetchGraph();
      },

      async retryCatalog(): Promise<void> {
        await loadCatalog(true);
      },

      /** Sélection d'un nœud (canevas, liste équivalente) : le détail de l'entrée est lu. */
      select(id: string | null): void {
        if (store.selectedId() === id) return;
        patchState(store, { selectedId: id, expandProblem: null });
        if (!id || isSuperNodeId(id)) {
          detailSeq++;
          patchState(store, { detail: idle() });
          return;
        }
        void loadDetail(id);
      },

      async retryDetail(): Promise<void> {
        const id = store.selectedId();
        if (id && !isSuperNodeId(id)) await loadDetail(id);
      },

      /**
       * « Déplier » un super-nœud (POST …/graph/expand) : ses membres et leurs liens remplacent le
       * groupe. 404 SUPER_NODE_NOT_FOUND : le graphe est relu (le groupe n'existe plus).
       */
      async expandGroup(superNodeId: string): Promise<boolean> {
        const patientId = store.patientId();
        const view = store.graph().data;
        if (!patientId || !view || store.expandingId()) return false;
        patchState(store, { expandingId: superNodeId, expandProblem: null });
        try {
          const expansion = await api.expand(patientId, superNodeId);
          const current = store.graph().data ?? view;
          patchState(store, {
            expandingId: null,
            graph: loaded(mergeExpansion(current, superNodeId, expansion)),
            expanded: [...store.expanded(), superNodeId],
            selectedId: store.selectedId() === superNodeId ? null : store.selectedId(),
          });
          return true;
        } catch (error) {
          const problem = asProblem(error);
          patchState(store, { expandingId: null, expandProblem: problem });
          if (problem.code === 'SUPER_NODE_NOT_FOUND') void fetchGraph();
          return false;
        }
      },

      /** Zoom et position du canevas pour une racine (suivis au fil des gestes). */
      rememberViewport(key: string, viewport: GraphViewport): void {
        patchState(store, { viewports: { ...store.viewports(), [key]: viewport } });
      },

      /** Positions des nœuds pour une racine (après le layout, après un glisser). */
      rememberPositions(key: string, positions: GraphPositions): void {
        const previous = store.positions()[key] ?? {};
        patchState(store, {
          positions: { ...store.positions(), [key]: { ...previous, ...positions } },
        });
      },

      /** « Recentrer » : les positions de la racine sont oubliées, le layout repart. */
      forgetLayout(key: string): void {
        const positions = { ...store.positions() };
        const viewports = { ...store.viewports() };
        delete positions[key];
        delete viewports[key];
        patchState(store, { positions, viewports });
      },

      /** L'état à ranger dans le shell (rememberTab) au départ de l'onglet. */
      snapshot(): GraphSnapshot | null {
        const patientId = store.patientId();
        if (!patientId) return null;
        return {
          patientId,
          query: store.query(),
          graph: store.graph().data,
          expanded: store.expanded(),
          selectedId: store.selectedId(),
          viewports: store.viewports(),
          positions: store.positions(),
        };
      },
    };
  }),
);

export type GraphStore = InstanceType<typeof GraphStore>;
