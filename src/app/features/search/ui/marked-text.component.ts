import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MarkedSegment } from '../data/search.model';

/**
 * Texte d'un résultat avec les mots trouvés surlignés (fiche 07) : chaque morceau passe par
 * l'interpolation d'Angular, jamais par innerHTML ; seul <mark> est produit. Le surlignage garde
 * le texte en text-primary sur --search-highlight (jamais la couleur seule : <mark> est annoncé).
 */
@Component({
  selector: 'pm-marked-text',
  template: `@for (segment of segments(); track $index) {
    @if (segment.mark) {
      <mark>{{ segment.text }}</mark>
    } @else {
      <ng-container>{{ segment.text }}</ng-container>
    }
  }`,
  styles: `
    mark {
      background: var(--search-highlight);
      color: var(--text-primary);
      border-radius: 2px;
      padding: 0 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkedTextComponent {
  readonly segments = input.required<MarkedSegment[]>();
}
