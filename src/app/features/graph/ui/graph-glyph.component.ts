import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EntryType } from '../../../shared/ui';
import { feelingDiameter } from './graph-scene';

/**
 * Forme d'une carte du graphe (fiche 04 : une forme par type, jamais la couleur seule) : ressenti
 * cercle dont la taille suit l'intensité, chiffre à l'intérieur ; événement losange ; situation
 * barre ; séance carré arrondi ; médicament capsule ; note rectangle. Décorative : le type est écrit
 * dans la carte.
 */
@Component({
  selector: 'pm-graph-glyph',
  template: `
    <span
      class="shape"
      [class]="'type-' + type()"
      [style.width.px]="diameter()"
      [style.height.px]="diameter()"
    ></span>
    @if (type() === 'feeling' && intensity() !== null) {
      <span class="value">{{ intensity() }}</span>
    }
  `,
  styles: `
    :host {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 34px;
      height: 34px;
    }
    .shape,
    .value {
      grid-area: 1 / 1;
    }
    .shape {
      box-sizing: border-box;
      display: block;
    }
    :host(.dim) .shape {
      opacity: 0.35;
    }
    .value {
      color: var(--feeling-text);
      font-family: var(--font-ui);
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }
    .type-feeling {
      border: 1.5px solid var(--feeling);
      border-radius: 50%;
      background: var(--feeling-tint);
    }
    .type-event {
      width: 18px;
      height: 18px;
      border: 1.5px solid var(--entry-event);
      border-radius: 3px;
      background: var(--primary-tint);
      transform: rotate(45deg);
    }
    .type-situation {
      width: 24px;
      height: 9px;
      border-radius: 4px;
      background: var(--entry-situation);
    }
    .type-session {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      background: var(--entry-session);
    }
    .type-medication {
      width: 26px;
      height: 13px;
      border-radius: 999px;
      background: var(--entry-medication);
    }
    .type-note {
      width: 20px;
      height: 16px;
      border-radius: 2px;
      background: var(--entry-note);
    }
  `,
  host: { 'aria-hidden': 'true', '[class.dim]': 'dim()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphGlyphComponent {
  readonly type = input.required<EntryType>();
  /** Intensité d'un ressenti (0 à 10) ; null sinon. */
  readonly intensity = input<number | null>(null);
  /** Hors du fil de l'entrée sélectionnée : la forme s'estompe (le chiffre reste lisible). */
  readonly dim = input(false);

  protected readonly diameter = computed(() =>
    this.type() === 'feeling' ? feelingDiameter(this.intensity()) : null,
  );
}
