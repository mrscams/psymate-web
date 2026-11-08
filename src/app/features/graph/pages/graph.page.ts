import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, Router } from '@angular/router';

import { ShortcutService } from '../../../core/shortcuts';
import {
  ENTRY_TYPES,
  EntryType,
  entryTypeLabel,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { ENTRY_QUERY_PARAM, openEntryEditor } from '../../entries';
import { PatientShellStore } from '../../patient-shell';
import {
  DEFAULT_DEPTH,
  GRAPH_DEPTHS,
  GRAPH_PERIODS,
  GraphDepth,
  GraphPeriod,
  GraphPositionsChange,
  GraphQuery,
  GraphViewportChange,
  hasGraphParams,
  isEmptyGraph,
  isSuperNodeId,
  LINK_TYPE_CODES,
  LinkDrop,
  parseQuery,
  sameQuery,
  TIMELINE_FOCUS,
  toQueryParams,
} from '../data/graph.model';
import { GraphSnapshot, GraphStore } from '../data/graph.store';
import { LinkTypeCode } from '../data/link.model';
import { openLinkEditor } from '../link-editor.launcher';
import { GraphCanvasComponent } from '../ui/graph-canvas.component';
import { GraphDetailComponent } from '../ui/graph-detail.component';
import { GraphElementLabels } from '../ui/graph-elements';
import {
  graphProblemMessage,
  graphProblemTitle,
  groupLabel,
  isRetryable,
  isRootProblem,
  nodeLabel,
  nodeName,
  periodLabel,
} from '../ui/graph-labels';
import { GraphLegendComponent } from '../ui/graph-legend.component';
import { GraphLinksTableComponent } from '../ui/graph-links-table.component';

/**
 * Onglet 3 du dossier, /patients/:id/graph?root=&depth= (fiche 04, B4 écran 4) : barre d'outils
 * (centré sur, profondeur 1–3, types d'entrées, liens, période, compteur, Recentrer, liste des
 * liens), canevas Cytoscape chargé en @defer, panneau de détail du nœud sélectionné et liste
 * équivalente des liens (B7). Glisser un nœud sur un autre ouvre l'éditeur de lien prérempli ;
 * double-clic : la timeline sur l'entrée (B2) ; un super-nœud se déplie. Racine, profondeur et
 * filtres vivent dans l'URL ; zoom, positions et sélection sont rangés dans le shell au départ.
 */
@Component({
  selector: 'pm-graph-page',
  imports: [
    GraphCanvasComponent,
    GraphDetailComponent,
    GraphLegendComponent,
    GraphLinksTableComponent,
    MatMenuModule,
    StateComponent,
  ],
  providers: [GraphStore],
  templateUrl: './graph.page.html',
  styleUrl: './graph.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphPage {
  protected readonly store = inject(GraphStore);
  private readonly shell = inject(PatientShellStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly shortcuts = inject(ShortcutService);
  private readonly detailPanel = viewChild(GraphDetailComponent);

  protected readonly depths = GRAPH_DEPTHS;
  protected readonly periods = GRAPH_PERIODS;
  protected readonly entryTypes = ENTRY_TYPES;
  protected readonly typeLabel = entryTypeLabel;
  protected readonly periodLabel = periodLabel;

  /** Liste équivalente des liens affichée (état d'écran). */
  protected readonly listOpen = signal(false);
  /** Incrémenté par « Recentrer » : le canevas relance le layout. */
  protected readonly relayoutCount = signal(0);
  /** Page quittée : un éditeur fermé ensuite ne relit plus le graphe. */
  private destroyed = false;

  private readonly params = toSignal(this.route.queryParamMap);

  // ── Données dérivées ────────────────────────────────────────────────────────────────

  protected readonly linkTypeLabels = computed(() => {
    const labels: Record<string, string> = {};
    for (const type of this.store.catalog().data ?? []) labels[type.code] = type.label;
    return labels;
  });

  protected readonly linkTypeOptions = computed(() =>
    LINK_TYPE_CODES.map((code) => ({ code, label: this.linkTypeLabels()[code] ?? code })),
  );

  /** Nom de chaque entrée du graphe (liste équivalente, « Centré sur », annonce). */
  protected readonly names = computed(() => {
    const labels = this.store.emotionLabels();
    const names: Record<string, string> = {};
    for (const node of this.store.graph().data?.nodes ?? []) {
      names[node.id] = nodeName(node, labels);
    }
    return names;
  });

  protected readonly canvasLabels = computed<GraphElementLabels>(() => {
    const labels = this.store.emotionLabels();
    return {
      node: (node) => nodeLabel(node, labels, this.locale),
      group: (group) => groupLabel(group, labels),
      proposed: $localize`:Étiquette d'un lien proposé (V2)@@graph.proposed:suggéré`,
    };
  });

  /** Choix de « Centré sur » : tout le dossier, puis les entrées du graphe par nom. */
  protected readonly rootOptions = computed(() => {
    const names = this.names();
    return (this.store.graph().data?.nodes ?? [])
      .map((node) => ({ id: node.id, name: `${names[node.id]} · ${entryTypeLabel(node.type)}` }))
      .sort((a, b) => a.name.localeCompare(b.name, this.locale));
  });

  protected readonly countText = computed(() => {
    const { nodes, edges } = this.store.counts();
    return $localize`:Compteur du graphe@@graph.count:${nodes}:nodes: nœuds · ${edges}:edges: liens`;
  });

  protected readonly canvasLabel = computed(() => {
    const { nodes, edges } = this.store.counts();
    return $localize`:Nom accessible du canevas du graphe@@graph.canvas.label:Graphe des liens : ${nodes}:nodes: nœuds, ${edges}:edges: liens. Le bouton « Liste des liens » en donne la version texte.`;
  });

  protected readonly typesText = computed(() => {
    const types = this.store.query().types;
    if (!types.length) {
      return $localize`:Filtre des types d'entrées, tous@@graph.filter.typesAll:Types d'entrées : tous`;
    }
    const count = types.length;
    return $localize`:Filtre des types d'entrées, nombre retenu@@graph.filter.typesSome:Types d'entrées : ${count}:count:`;
  });

  protected readonly linksText = computed(() => {
    const codes = this.store.query().linkTypes;
    if (!codes.length)
      return $localize`:Filtre des types de liens, tous@@graph.filter.linksAll:Liens : tous`;
    const count = codes.length;
    return $localize`:Filtre des types de liens, nombre retenu@@graph.filter.linksSome:Liens : ${count}:count:`;
  });

  // ── États ───────────────────────────────────────────────────────────────────────────

  /** Trois états du bloc graphe ; null : le canevas s'affiche (le précédent reste en erreur). */
  protected readonly graphState = computed<StateKind | null>(() => {
    const kind = stateKind(this.store.graph(), isEmptyGraph);
    if (kind) return kind;
    const view = this.store.view();
    return view && isEmptyGraph(view) ? 'empty' : null;
  });

  /** Vide parce que le filtre des types masque tout (le graphe reçu a des liens). */
  private readonly filteredEmpty = computed(() => {
    const data = this.store.graph().data;
    return !!data && !isEmptyGraph(data) && this.graphState() === 'empty';
  });

  protected readonly stateTitle = computed(() => {
    switch (this.graphState()) {
      case 'error':
        return graphProblemTitle(this.store.graph().problem);
      case 'empty':
        if (this.filteredEmpty()) {
          return $localize`:Graphe vide à cause du filtre des types@@graph.empty.filtered:Aucun lien entre les types d'entrées retenus`;
        }
        return this.store.query().root
          ? $localize`:Graphe vide autour d'une entrée@@graph.empty.root:Aucun lien autour de cette entrée`
          : $localize`:Graphe vide@@graph.empty.title:Les liens que vous créez apparaîtront ici`;
      default:
        return undefined;
    }
  });

  protected readonly stateMessage = computed(() => {
    switch (this.graphState()) {
      case 'error':
        return graphProblemMessage(this.store.graph().problem);
      case 'empty':
        return this.filteredEmpty()
          ? undefined
          : $localize`:Que faire quand le graphe est vide@@graph.empty.message:Liez deux entrées depuis la timeline ou l'éditeur d'entrée, ou glissez un nœud sur un autre.`;
      default:
        return undefined;
    }
  });

  protected readonly stateAction = computed<StateAction | undefined>(() => {
    const problem = this.store.graph().problem;
    switch (this.graphState()) {
      case 'error':
        // 404, 409 ou 422 sur root (DIFFERENT_PATIENT) : la racine est en cause, pas les filtres.
        if (isRootProblem(problem)) {
          return { label: this.wholeFolderLabel, handler: () => this.recenter(null) };
        }
        if (problem?.code === 'VALIDATION_FAILED') {
          return { label: this.resetFiltersLabel, handler: () => this.resetFilters() };
        }
        return isRetryable(problem) ? this.retryAction : undefined;
      case 'empty':
        return this.filteredEmpty()
          ? { label: this.allTypesLabel, handler: () => this.setTypes([]) }
          : { label: this.timelineLabel, handler: () => this.openTimeline(null) };
      default:
        return undefined;
    }
  });

  /** Relecture en échec alors que le dernier graphe reste affiché (B4 : « le dernier graphe reste »). */
  protected readonly staleError = computed(
    () => this.store.graph().status === 'error' && this.graphState() === null,
  );

  /** Titre de l'alerte de relecture en échec (l'état erreur du bloc, lui, n'est pas affiché). */
  protected readonly staleTitle = computed(() => graphProblemTitle(this.store.graph().problem));

  protected readonly refreshing = computed(
    () => this.store.graph().status === 'loading' && !!this.store.graph().data,
  );

  protected readonly catalogFailed = computed(() => this.store.catalog().status === 'error');

  protected readonly selectionAnnouncement = computed(() => {
    const group = this.store.selectedGroup();
    if (group) {
      const label = groupLabel(group, this.store.emotionLabels());
      return $localize`:Annonce de la sélection d'un super-nœud@@graph.announce.group:Groupe sélectionné : ${label}:label:`;
    }
    const node = this.store.selectedNode();
    if (!node) return '';
    const name = this.names()[node.id] ?? '';
    const type = entryTypeLabel(node.type);
    return $localize`:Annonce de la sélection d'un nœud@@graph.announce.node:Entrée sélectionnée : ${name}:name:, ${type}:type:`;
  });

  protected readonly hasSelection = computed(
    () => !!this.store.selectedNode() || !!this.store.selectedGroup(),
  );

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retry(),
  };
  protected readonly catalogRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryCatalog(),
  };
  protected readonly catalogErrorTitle = $localize`:Types de liens illisibles dans le graphe@@graph.catalog.error:Impossible de charger les types de liens`;
  private readonly wholeFolderLabel = $localize`:Action qui centre le graphe sur tout le dossier@@graph.action.wholeFolder:Voir tout le dossier`;
  private readonly resetFiltersLabel = $localize`:Action qui remet les filtres du graphe par défaut@@graph.action.resetFilters:Filtres par défaut`;
  private readonly allTypesLabel = $localize`:Action qui montre tous les types d'entrées@@graph.action.allTypes:Montrer tous les types`;
  private readonly timelineLabel = $localize`:Action qui ouvre la timeline depuis le graphe vide@@graph.action.timeline:Ouvrir la timeline`;
  protected readonly loadingCanvasTitle = $localize`:Chargement du moteur du graphe@@graph.canvas.loading:Préparation du graphe…`;
  protected readonly canvasFailedTitle = $localize`:Le moteur du graphe ne s'est pas chargé@@graph.canvas.failed:Impossible d'afficher le graphe`;
  protected readonly canvasFailedMessage = $localize`:Que faire quand le moteur du graphe manque@@graph.canvas.failedMessage:Rechargez la page pour réessayer. La liste des liens reste disponible (bouton « Liste des liens »).`;
  protected readonly depthLabelId = 'graph-depth-label';

  constructor() {
    // Le patient (en-tête) et l'URL : premier chargement, reprise de l'état rangé, ou nouvelle requête.
    effect(() => {
      const patient = this.shell.patient();
      const params = this.params();
      if (!patient || !params) return;
      untracked(() => {
        const query = parseQuery(params);
        if (this.store.patientId() !== patient.id) {
          const recalled = this.shell.recallTab<GraphSnapshot>('graph');
          const snapshot = recalled?.patientId === patient.id ? recalled : undefined;
          if (snapshot && (!hasGraphParams(params) || sameQuery(snapshot.query, query))) {
            void this.store.restore(snapshot);
            if (!sameQuery(snapshot.query, query)) this.navigate(snapshot.query, true);
          } else {
            void this.store.load(patient.id, query);
          }
          // Repris : l'état ne vit plus que dans le GraphStore (rangé à nouveau au départ).
          if (recalled) this.shell.rememberTab<GraphSnapshot | undefined>('graph', undefined);
          return;
        }
        if (!sameQuery(this.store.query(), query)) void this.store.load(patient.id, query);
      });
    });

    const destroyRef = inject(DestroyRef);
    // L : lie l'entrée ouverte (?entry=, comme le shell) ou, à défaut, l'entrée sélectionnée.
    destroyRef.onDestroy(
      this.shortcuts.register(
        'l',
        () => {
          const open = this.params()?.get(ENTRY_QUERY_PARAM);
          const selected = this.store.selectedNode()?.id;
          const entryId = open || selected;
          if (entryId) this.link(entryId);
        },
        $localize`:Aide des raccourcis, graphe@@shortcuts.graph.l:Lier l'entrée sélectionnée`,
      ),
    );

    // Départ de l'onglet : requête, graphe, zoom, positions et sélection rangés dans le shell (B2).
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      const snapshot = this.store.snapshot();
      if (snapshot) this.shell.rememberTab<GraphSnapshot>('graph', snapshot);
    });
  }

  // ── Barre d'outils ──────────────────────────────────────────────────────────────────

  protected onRootChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.recenter(value || null);
  }

  protected setDepth(depth: GraphDepth): void {
    this.update({ depth });
  }

  protected onPeriodChange(event: Event): void {
    this.update({ period: (event.target as HTMLSelectElement).value as GraphPeriod });
  }

  protected typeChecked(type: EntryType): boolean {
    const types = this.store.query().types;
    return !types.length || types.includes(type);
  }

  protected toggleType(type: EntryType): void {
    this.setTypes(toggle(this.store.query().types, type, ENTRY_TYPES));
  }

  protected setTypes(types: EntryType[]): void {
    this.update({ types });
  }

  protected linkTypeChecked(code: LinkTypeCode): boolean {
    const codes = this.store.query().linkTypes;
    return !codes.length || codes.includes(code);
  }

  protected toggleLinkType(code: LinkTypeCode): void {
    this.update({ linkTypes: toggle(this.store.query().linkTypes, code, LINK_TYPE_CODES) });
  }

  protected setLinkTypes(linkTypes: LinkTypeCode[]): void {
    this.update({ linkTypes });
  }

  /** « Recentrer » : le layout repart (positions de cette racine oubliées). */
  protected relayout(): void {
    this.store.forgetLayout(this.store.key());
    this.relayoutCount.update((n) => n + 1);
  }

  protected toggleList(): void {
    this.listOpen.update((open) => !open);
  }

  // ── Canevas ─────────────────────────────────────────────────────────────────────────

  protected onSelect(id: string | null): void {
    this.store.select(id);
  }

  /** Double-clic : la timeline sur l'entrée (B2) ; sur un super-nœud, il se déplie. */
  protected onActivate(id: string): void {
    if (isSuperNodeId(id)) void this.store.expandGroup(id);
    else this.openTimeline(id);
  }

  /** Glisser A sur B : l'éditeur de lien s'ouvre avec A pour source et B pour cible (B3 flux 4). */
  protected onLinkDrop(drop: LinkDrop): void {
    this.link(drop.sourceId, drop.targetId);
  }

  /** Zoom et position, rangés sous la racine du graphe dessiné (pas celle d'une lecture en cours). */
  protected onViewport(change: GraphViewportChange): void {
    this.store.rememberViewport(change.key, change.viewport);
  }

  /** Positions, rangées sous la racine du layout qui les a produites. */
  protected onPositions(change: GraphPositionsChange): void {
    this.store.rememberPositions(change.key, change.positions);
  }

  // ── Panneau de détail et liste équivalente ──────────────────────────────────────────

  /** Sélection depuis la liste équivalente ou une phrase du panneau : le focus va au panneau. */
  protected selectFromList(id: string): void {
    this.store.select(id);
    afterNextRender(() => this.detailPanel()?.focus(), { injector: this.injector });
  }

  protected closeDetail(): void {
    this.store.select(null);
  }

  protected recenter(id: string | null): void {
    this.update({ root: id }, false);
  }

  protected openTimeline(id: string | null): void {
    const patientId = this.store.patientId();
    if (!patientId) return;
    void this.router.navigate(['/patients', patientId, 'timeline'], {
      queryParams: id ? { [TIMELINE_FOCUS]: id } : {},
    });
  }

  /** « Lier » (M2-04) : à la fermeture de l'éditeur, le graphe est relu (projection). */
  protected link(entryId: string, targetId: string | null = null): void {
    const ref = openLinkEditor(entryId, {
      injector: this.injector,
      patientName: this.shell.patient()?.displayName,
      targetId,
    });
    void ref?.closed.then(() => {
      if (!this.destroyed) void this.store.refresh();
    });
  }

  /** « Corriger » : l'éditeur d'entrée (une correction crée une version), puis relecture. */
  protected edit(entryId: string): void {
    const patientId = this.store.patientId();
    if (!patientId) return;
    const ref = openEntryEditor(patientId, { entryId, injector: this.injector });
    void ref?.closed.then((saved) => {
      if (saved && !this.destroyed) void this.store.refresh();
    });
  }

  protected expand(superNodeId: string): void {
    void this.store.expandGroup(superNodeId);
  }

  // ── URL ─────────────────────────────────────────────────────────────────────────────

  private resetFilters(): void {
    this.update({ linkTypes: [], types: [], period: 'all', depth: DEFAULT_DEPTH });
  }

  /** Nouvelle requête : l'URL change (l'effet relit) ; un filtre remplace l'entrée d'historique. */
  private update(change: Partial<GraphQuery>, replaceUrl = true): void {
    this.navigate({ ...this.store.query(), ...change }, replaceUrl);
  }

  private navigate(query: GraphQuery, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(query),
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}

/** Coche ou décoche une valeur d'un filtre « vide = tout » ; tout coché redevient vide. */
function toggle<T>(current: readonly T[], value: T, all: readonly T[]): T[] {
  const base = current.length ? current : all;
  const next = base.includes(value) ? base.filter((item) => item !== value) : [...base, value];
  if (!next.length) return [...base];
  return next.length === all.length ? [] : all.filter((item) => next.includes(item));
}
