import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PUBLIC_PATHS } from './public-paths';

/**
 * Pied du layout public (fiche 00 §4) : mentions légales · confidentialité · accessibilité, sans
 * numéro d'urgence (G Q20). Posé par `PublicLayoutComponent` et par la coquille (UX-A10).
 */
@Component({
  selector: 'pm-public-footer',
  imports: [RouterLink],
  templateUrl: './public-footer.component.html',
  styleUrl: './public-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicFooterComponent {
  protected readonly paths = PUBLIC_PATHS;
}
