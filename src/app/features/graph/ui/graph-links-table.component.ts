import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { EntryIconComponent, EntryType, StateComponent } from '../../../shared/ui';
import { GraphView } from '../data/graph.model';
import { groupLabel, provenanceLabel, statusLabel } from './graph-labels';

/**
 * Liste équivalente du graphe (fiche 04 « Accessibilité », B7) : un tableau « source · type ·
 * cible · provenance · statut » des mêmes liens que le canevas, lisible au clavier et par un lecteur
 * d'écran. Chaque extrémité est un bouton qui sélectionne l'entrée (panneau de détail). Les
 * super-nœuds du canevas ont leur tableau « Groupes » : le groupe (sélection), l'entrée voisine et
 * « Déplier » au clavier.
 */
@Component({
  selector: 'pm-graph-links-table',
  imports: [EntryIconComponent, StateComponent],
  template: `
    @if (rows().length) {
      <table class="table">
        <caption>
          {{
            caption
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" i18n="Colonne source de la liste des liens@@graph.table.source">
              Source
            </th>
            <th scope="col" i18n="Colonne type de la liste des liens@@graph.table.type">Lien</th>
            <th scope="col" i18n="Colonne cible de la liste des liens@@graph.table.target">
              Cible
            </th>
            <th scope="col" i18n="Colonne provenance de la liste des liens@@graph.table.provenance">
              Provenance
            </th>
            <th scope="col" i18n="Colonne statut de la liste des liens@@graph.table.status">
              Statut
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.id) {
            <tr [attr.data-link-id]="row.id">
              <td>
                <button type="button" class="entry" (click)="selectEntry.emit(row.source.id)">
                  <pm-entry-icon [type]="row.source.type" [size]="14" />
                  {{ row.source.name }}
                </button>
              </td>
              <td>{{ row.label }}</td>
              <td>
                <button type="button" class="entry" (click)="selectEntry.emit(row.target.id)">
                  <pm-entry-icon [type]="row.target.type" [size]="14" />
                  {{ row.target.name }}
                </button>
              </td>
              <td>{{ row.provenance }}</td>
              <td>{{ row.status }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <pm-state kind="empty" [title]="emptyTitle" compact />
    }
    @if (groups().length) {
      <table class="table groups">
        <caption>
          {{
            groupsCaption
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" i18n="Colonne groupe de la liste des super-nœuds@@graph.table.group">
              Groupe
            </th>
            <th scope="col" i18n="Colonne voisin de la liste des super-nœuds@@graph.table.neighbor">
              Relié à
            </th>
            <th scope="col" i18n="Colonne action de la liste des super-nœuds@@graph.table.action">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          @for (group of groups(); track group.id) {
            <tr [attr.data-group-id]="group.id">
              <td>
                <button type="button" class="entry" (click)="selectEntry.emit(group.id)">
                  <pm-entry-icon [type]="group.type" [size]="14" />
                  {{ group.label }}
                </button>
              </td>
              <td>
                <button type="button" class="entry" (click)="selectEntry.emit(group.neighbor.id)">
                  <pm-entry-icon [type]="group.neighbor.type" [size]="14" />
                  {{ group.neighbor.name }}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="entry expand"
                  [disabled]="expanding()"
                  [attr.aria-label]="group.expandLabel"
                  (click)="expandGroup.emit(group.id)"
                  i18n="Bouton qui déplie un super-nœud depuis la liste@@graph.table.expand"
                >
                  Déplier
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    caption {
      padding: 8px 0;
      color: var(--text-secondary);
      font: var(--mat-sys-label-large);
      text-align: left;
    }
    th,
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-subtle);
      text-align: left;
      vertical-align: middle;
    }
    th {
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
    }
    .entry {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 2px 6px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .entry:hover {
      background: var(--surface-sunken);
    }
    .groups {
      margin-top: 12px;
    }
    .expand {
      color: var(--primary-hover);
    }
    .entry:disabled {
      color: var(--text-disabled);
      cursor: default;
    }
    .entry:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphLinksTableComponent {
  readonly view = input.required<GraphView>();
  /** Nom de chaque entrée (identifiant → « titre » ou « Anxiété 8 »). */
  readonly names = input.required<Record<string, string>>();
  /** Libellé de chaque type de lien (catalogue) ; à défaut, le code. */
  readonly linkLabels = input<Record<string, string>>({});
  readonly emotionLabels = input<Record<string, string>>({});
  /** Un dépliage est en cours (boutons « Déplier » inactifs). */
  readonly expanding = input(false);

  /** Une entrée ou un groupe (sn:…) à sélectionner. */
  readonly selectEntry = output<string>();
  /** « Déplier » un super-nœud (POST …/graph/expand). */
  readonly expandGroup = output<string>();

  protected readonly caption = $localize`:Légende du tableau équivalent au graphe@@graph.table.caption:Liens du graphe (même contenu que le canevas)`;
  protected readonly emptyTitle = $localize`:Liste des liens du graphe vide@@graph.table.empty:Aucun lien dans ce graphe`;
  protected readonly groupsCaption = $localize`:Légende du tableau des super-nœuds@@graph.table.groupsCaption:Groupes d'entrées regroupées (à déplier)`;

  protected readonly groups = computed(() => {
    const view = this.view();
    const names = this.names();
    const emotions = this.emotionLabels();
    const types = new Map<string, EntryType>(view.nodes.map((node) => [node.id, node.type]));
    return view.superNodes.map((group) => {
      const label = groupLabel(group, emotions);
      return {
        id: group.id,
        type: group.type,
        label,
        neighbor: {
          id: group.neighborId,
          name: names[group.neighborId] ?? '',
          type: types.get(group.neighborId) ?? 'note',
        },
        expandLabel: $localize`:Nom accessible du bouton Déplier d'un groupe@@graph.table.expandLabel:Déplier : ${label}:label:`,
      };
    });
  });

  protected readonly rows = computed(() => {
    const view = this.view();
    const names = this.names();
    const labels = this.linkLabels();
    const types = new Map<string, EntryType>(view.nodes.map((node) => [node.id, node.type]));
    return view.edges.map((edge) => ({
      id: edge.id,
      source: {
        id: edge.source,
        name: names[edge.source] ?? '',
        type: types.get(edge.source) ?? 'note',
      },
      target: {
        id: edge.target,
        name: names[edge.target] ?? '',
        type: types.get(edge.target) ?? 'note',
      },
      label: labels[edge.linkType] ?? edge.linkType,
      provenance: provenanceLabel(edge.provenance),
      status: statusLabel(edge.status),
    }));
  });
}
