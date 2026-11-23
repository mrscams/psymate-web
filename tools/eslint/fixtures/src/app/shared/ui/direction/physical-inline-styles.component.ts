// expect: psymate/no-physical-direction
// Violation : propriété physique dans les styles en ligne d'un composant.
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'pm-physical-inline-styles',
  template: '',
  styles: `
    ul {
      padding-left: 20px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhysicalInlineStylesComponent {}
