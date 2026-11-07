// expect: psymate/no-hardcoded-color
// Violation : couleur hexadécimale dans les styles en ligne d'un composant.
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'pm-hex-inline',
  template: '',
  styles: [':host { color: #3a63c2; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HexInlineComponent {}
