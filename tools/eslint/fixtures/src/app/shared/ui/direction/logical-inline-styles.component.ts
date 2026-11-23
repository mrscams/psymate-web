// expect: none
// Permis : styles en ligne logiques ; un objet de données avec une clé left n'est pas un style.
import { ChangeDetectionStrategy, Component } from '@angular/core';

export const LEGEND = { left: 'center', top: 8 };

@Component({
  selector: 'pm-logical-inline-styles',
  template: '',
  styles: `
    ul {
      padding-inline-start: 20px;
    }
  `,
  host: { '[style.inset-inline-start.px]': 'offset' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogicalInlineStylesComponent {
  protected readonly offset = 0;
}
