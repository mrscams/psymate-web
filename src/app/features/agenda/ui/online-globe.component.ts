import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Globe décoratif de la mention « Demande en ligne » (fiche 15, demandes en ligne) : grille, mois,
 * liste, légende et détail. Toujours `aria-hidden` : le texte « Demande en ligne » porte
 * l'information, jamais le pictogramme ni la couleur. Taille par `--globe-size` (12 px par défaut).
 */
@Component({
  selector: 'pm-online-globe',
  template: `<svg class="globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    .globe {
      width: var(--globe-size, 12px);
      height: var(--globe-size, 12px);
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineGlobeComponent {}
