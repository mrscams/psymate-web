// expect: psymate/no-physical-direction
// Violation : liaison de style d'hôte physique.
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'pm-physical-host-binding',
  template: '',
  host: { '[style.margin-right.px]': 'gap' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhysicalHostBindingComponent {
  protected readonly gap = 4;
}
