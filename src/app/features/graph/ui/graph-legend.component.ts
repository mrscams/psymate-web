import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { ENTRY_TYPES, EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { LinkLineStyle } from '../data/link.model';

interface LineSample {
  style: LinkLineStyle;
  label: string;
  dash: string | null;
  width: number;
}

/**
 * Légende du graphe (fiche 04 §3, repliable) : la forme de chaque type d'entrée (icônes partagées)
 * et le trait de chaque style de lien (étude couleurs §4). Couleurs en tokens seulement.
 */
@Component({
  selector: 'pm-graph-legend',
  imports: [EntryIconComponent],
  template: `
    <button
      type="button"
      class="toggle"
      [attr.aria-expanded]="open()"
      aria-controls="graph-legend-body"
      (click)="open.set(!open())"
      i18n="Bouton qui déplie la légende du graphe@@graph.legend.toggle"
    >
      Légende
    </button>
    @if (open()) {
      <div class="body" id="graph-legend-body">
        <ul class="list" [attr.aria-label]="shapesLabel">
          @for (type of types; track type) {
            <li>
              <pm-entry-icon [type]="type" [size]="14" />
              {{ typeLabel(type) }}
            </li>
          }
          <li>
            <span class="group-sample" aria-hidden="true"></span>
            <span i18n="Légende du super-nœud@@graph.legend.group"
              >Groupe d'entrées (à déplier)</span
            >
          </li>
        </ul>
        <ul class="list" [attr.aria-label]="linesLabel">
          @for (line of lines; track line.style) {
            <li>
              <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true" focusable="false">
                @if (line.style === 'double') {
                  <path d="M0 2.5h28M0 5.5h28" class="line" stroke-width="1" />
                } @else {
                  <path
                    d="M0 4h28"
                    class="line"
                    [attr.stroke-width]="line.width"
                    [attr.stroke-dasharray]="line.dash"
                  />
                }
              </svg>
              {{ line.label }}
            </li>
          }
        </ul>
        <p class="note" i18n="Légende de la taille des ressentis@@graph.legend.feeling">
          Ressenti : la taille suit l'intensité. Racine : bordure bleue.
        </p>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-small);
    }
    .toggle {
      width: 100%;
      min-height: 36px;
      padding: 0 12px;
      border: 0;
      background: transparent;
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      text-align: left;
      cursor: pointer;
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
    .body {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, auto));
      gap: 4px 20px;
      padding: 0 12px 10px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .line {
      stroke: var(--link);
      fill: none;
    }
    .group-sample {
      width: 18px;
      height: 10px;
      border: 1px dashed var(--border-strong);
      border-radius: 3px;
      background: var(--surface-sunken);
    }
    .note {
      grid-column: 1 / -1;
      margin: 4px 0 0;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphLegendComponent {
  protected readonly open = signal(false);
  protected readonly types = ENTRY_TYPES;
  protected readonly typeLabel = entryTypeLabel;
  protected readonly shapesLabel = $localize`:Nom de la liste des formes de la légende@@graph.legend.shapes:Formes des entrées`;
  protected readonly linesLabel = $localize`:Nom de la liste des traits de la légende@@graph.legend.lines:Traits des liens`;

  protected readonly lines: LineSample[] = [
    {
      style: 'solid',
      dash: null,
      width: 1.5,
      label: $localize`:Légende d'un trait de lien@@graph.legend.solid:trait plein : déclenche, est causé par`,
    },
    {
      style: 'long_dash',
      dash: '9 5',
      width: 1.5,
      label: $localize`:Légende d'un trait de lien@@graph.legend.longDash:tirets longs : aggrave`,
    },
    {
      style: 'short_dash',
      dash: '4 4',
      width: 1.5,
      label: $localize`:Légende d'un trait de lien@@graph.legend.shortDash:tirets courts : soulage`,
    },
    {
      style: 'dotted',
      dash: '1.5 3',
      width: 1.5,
      label: $localize`:Légende d'un trait de lien@@graph.legend.dotted:pointillé sans flèche : co-occurrence`,
    },
    {
      style: 'thin',
      dash: null,
      width: 1,
      label: $localize`:Légende d'un trait de lien@@graph.legend.thin:trait fin : suit, fait partie de`,
    },
    {
      style: 'double',
      dash: null,
      width: 1,
      label: $localize`:Légende d'un trait de lien@@graph.legend.double:trait double : traite`,
    },
  ];
}
