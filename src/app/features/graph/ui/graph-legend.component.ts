import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { ENTRY_TYPES, EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { LinkLineStyle } from '../data/link.model';

interface LineSample {
  style: LinkLineStyle;
  /** Nom du trait, pour les lecteurs d'écran (l'échantillon dessiné est décoratif). */
  name: string;
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
    >
      <span i18n="Bouton qui replie ou déplie la légende du graphe@@graph.legend.toggle"
        >Légende</span
      >
      <svg
        class="chevron"
        [class.up]="!open()"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M2 4l3 3 3-3" />
      </svg>
    </button>
    @if (open()) {
      <div class="body" id="graph-legend-body">
        <ul class="list" [attr.aria-label]="shapesLabel">
          @for (type of types; track type) {
            <li>
              <pm-entry-icon [type]="type" [size]="12" />
              {{ type === 'feeling' ? feelingLabel : typeLabel(type) }}
            </li>
          }
          <li>
            <span class="root-sample" aria-hidden="true"></span>
            <span i18n="Légende de la racine du graphe@@graph.legend.root">Racine</span>
          </li>
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
              <span class="sr-only">{{ line.name }} :</span>
              {{ line.label }}
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
      font-size: 11px;
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 28px;
      padding: 0 12px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
      text-align: left;
      cursor: pointer;
    }
    .toggle:hover {
      color: var(--text-primary);
    }
    .chevron {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
    }
    .chevron.up {
      transform: rotate(180deg);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
    .body {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, auto));
      gap: 4px 18px;
      padding: 0 12px 10px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
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
    .root-sample {
      box-sizing: border-box;
      width: 12px;
      height: 12px;
      border: 2px solid var(--primary);
      border-radius: 3px;
      background: var(--surface-raised);
    }
    @media (max-width: 600px) {
      .body {
        grid-template-columns: minmax(0, 1fr);
      }
      li {
        white-space: normal;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphLegendComponent {
  /**
   * Dépliée à l'arrivée (fiche 04 §3, UX-B3), repliable ; repliée sur un écran étroit, où elle
   * couvrirait le graphe.
   */
  protected readonly open = signal(
    typeof matchMedia !== 'function' || !matchMedia('(max-width: 600px)').matches,
  );
  protected readonly types = ENTRY_TYPES;
  protected readonly typeLabel = entryTypeLabel;
  protected readonly shapesLabel = $localize`:Nom de la liste des formes de la légende@@graph.legend.shapes:Formes des entrées`;
  protected readonly linesLabel = $localize`:Nom de la liste des traits de la légende@@graph.legend.lines:Traits des liens`;

  protected readonly feelingLabel = $localize`:Légende des ressentis du graphe@@graph.legend.feelingSize:Ressenti · taille et chiffre = intensité`;

  /** Le trait (nom lu par les lecteurs d'écran, échantillon dessiné) puis ses types de lien. */
  protected readonly lines: LineSample[] = [
    {
      style: 'solid',
      dash: null,
      width: 1.5,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.solidName:trait plein`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.solidTypes:déclenche, est causé par`,
    },
    {
      style: 'long_dash',
      dash: '9 5',
      width: 1.5,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.longDashName:tirets longs`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.longDashTypes:aggrave`,
    },
    {
      style: 'short_dash',
      dash: '4 4',
      width: 1.5,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.shortDashName:tirets courts`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.shortDashTypes:soulage`,
    },
    {
      style: 'dotted',
      dash: '1.5 3',
      width: 1.5,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.dottedName:pointillé sans flèche`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.dottedTypes:co-occurrence`,
    },
    {
      style: 'thin',
      dash: null,
      width: 1,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.thinName:trait fin`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.thinTypes:suit, fait partie de`,
    },
    {
      style: 'double',
      dash: null,
      width: 1,
      name: $localize`:Nom d'un trait de lien de la légende@@graph.legend.doubleName:trait double`,
      label: $localize`:Types de lien d'un trait de la légende@@graph.legend.doubleTypes:traite`,
    },
  ];
}
