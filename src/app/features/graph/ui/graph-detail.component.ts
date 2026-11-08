import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  LOCALE_ID,
  inject,
  output,
  viewChild,
} from '@angular/core';

import { ApiProblem } from '../../../core/http';
import {
  EntryIconComponent,
  entryTypeLabel,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { formatOccurred, Loadable, stateKind } from '../../../shared/util';
import { GraphNode, GraphSuperNode } from '../data/graph.model';
import { NodeDetail } from '../data/graph.store';
import { otherEnd } from '../data/link.model';
import { groupLabel, isRetryable, nodeName, typePlural } from './graph-labels';

/**
 * Panneau de détail du nœud sélectionné (fiche 04 §4, `role="complementary"`) : type, titre, quand,
 * émotion, texte, les liens de l'entrée en phrases lisibles (liste équivalente B7 : chaque phrase
 * mène à l'autre entrée), et les actions « Voir dans la timeline », « Recentrer le graphe ici »,
 * « Lier » (éditeur de lien, M2-04), « Corriger » (éditeur d'entrée). Un super-nœud montre son
 * groupe et « Déplier ».
 */
@Component({
  selector: 'pm-graph-detail',
  imports: [EntryIconComponent, StateComponent],
  templateUrl: './graph-detail.component.html',
  styleUrl: './graph-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphDetailComponent {
  /** L'entrée sélectionnée (nœud du graphe) ; null pour un super-nœud. */
  readonly node = input<GraphNode | null>(null);
  readonly group = input<GraphSuperNode | null>(null);
  readonly detail = input.required<Loadable<NodeDetail>>();
  readonly emotionLabels = input<Record<string, string>>({});
  /** La racine du graphe (pas de « Recentrer » sur elle). */
  readonly root = input<string | null>(null);
  readonly expanding = input(false);
  readonly expandProblem = input<ApiProblem | null>(null);

  readonly closed = output<void>();
  readonly recenter = output<string>();
  readonly showInTimeline = output<string>();
  readonly link = output<string>();
  readonly edit = output<string>();
  readonly expand = output<string>();
  readonly retry = output<void>();
  /** Une phrase de la liste des liens : l'autre entrée devient la sélection. */
  readonly selectEntry = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly headingId = 'graph-detail-title';

  protected readonly title = computed(() => {
    const group = this.group();
    if (group) return groupLabel(group, this.emotionLabels());
    const node = this.node();
    return node ? nodeName(node, this.emotionLabels()) : '';
  });

  protected readonly type = computed(() => this.group()?.type ?? this.node()?.type ?? 'note');
  protected readonly typeLabel = computed(() => entryTypeLabel(this.type()));
  protected readonly isGroup = computed(() => !!this.group());

  protected readonly state = computed(() => stateKind(this.detail()));
  protected readonly entry = computed(() => this.detail().data?.entry ?? null);

  protected readonly when = computed(() => {
    const entry = this.entry();
    if (!entry?.occurredFrom) return null;
    return formatOccurred(
      { from: entry.occurredFrom, to: entry.occurredTo, precision: entry.precision },
      this.locale,
    );
  });

  protected readonly emotion = computed(() => {
    const node = this.node();
    if (!node || node.type !== 'feeling' || !node.emotion) return null;
    const label = this.emotionLabels()[node.emotion] ?? node.emotion;
    return node.intensity !== null
      ? $localize`:Émotion et intensité d'un ressenti@@graph.detail.emotionValue:${label}:emotion: · intensité ${node.intensity}:intensity:/10`
      : label;
  });

  protected readonly links = computed(() => {
    const data = this.detail().data;
    if (!data) return [];
    return data.links.map((item) => ({
      id: item.id,
      sentence: item.sentence || item.label,
      other: otherEnd(item, data.entry.id),
    }));
  });

  protected readonly linksHeading = computed(() => {
    const count = this.links().length;
    return $localize`:Titre de la liste des liens d'une entrée du graphe@@graph.detail.links:Liens de cette entrée · ${count}:count:`;
  });

  protected readonly groupText = computed(() => {
    const group = this.group();
    if (!group) return '';
    const count = group.count;
    const types = typePlural(group.type);
    return $localize`:Explication d'un super-nœud@@graph.detail.groupText:${count}:count: ${types}:types: reliés à la même entrée et à elle seule, regroupés pour garder le graphe lisible.`;
  });

  protected readonly retryAction = computed<StateAction | undefined>(() =>
    isRetryable(this.detail().problem)
      ? {
          label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
          handler: () => this.retry.emit(),
        }
      : undefined,
  );

  protected readonly isRoot = computed(() => {
    const node = this.node();
    return !!node && node.id === this.root();
  });

  protected readonly expandError = computed(() => {
    const problem = this.expandProblem();
    if (!problem) return null;
    return problem.code === 'SUPER_NODE_NOT_FOUND'
      ? $localize`:Super-nœud disparu (404)@@graph.expand.gone:Ce groupe n'existe plus : le graphe a été relu.`
      : $localize`:Dépliage impossible@@graph.expand.failed:Le groupe n'a pas pu être déplié. Réessayez.`;
  });

  protected readonly detailErrorTitle = $localize`:Détail d'une entrée du graphe illisible@@graph.detail.error:Impossible de charger cette entrée`;
  protected readonly closeLabel = $localize`:Bouton qui ferme le détail d'un nœud du graphe@@graph.detail.close:Fermer le détail`;
  protected readonly noLinks = $localize`:Entrée du graphe sans lien@@graph.detail.noLinks:Aucun lien sur cette entrée pour le moment.`;

  /** Donne le focus au titre du panneau (sélection depuis la liste équivalente). */
  focus(): void {
    this.heading()?.nativeElement.focus();
  }
}
