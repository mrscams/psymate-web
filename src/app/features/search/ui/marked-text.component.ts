import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MarkedSegment } from '../data/search.model';
import { hasRtlLetter } from './bidi';

/**
 * Texte d'un résultat avec les mots trouvés surlignés (fiche 07) : chaque morceau passe par
 * l'interpolation d'Angular, jamais par innerHTML ; seul <mark> est produit. Le surlignage garde
 * le texte en text-primary sur --search-highlight (jamais la couleur seule : <mark> est annoncé).
 * Un morceau surligné en écriture de droite à gauche (arabe) n'a pas de marge intérieure
 * horizontale : un padding entre deux morceaux d'un même mot couperait la liaison des lettres
 * (docs/design/arabe.md §4). Le texte latin garde son padding d'origine.
 */
@Component({
  selector: 'pm-marked-text',
  template: `@for (segment of segments(); track $index) {
    @if (segment.mark) {
      <mark [class.joined]="joined(segment.text)">{{ segment.text }}</mark>
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
    mark.joined {
      padding: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkedTextComponent {
  readonly segments = input.required<MarkedSegment[]>();

  protected readonly joined = hasRtlLetter;
}
