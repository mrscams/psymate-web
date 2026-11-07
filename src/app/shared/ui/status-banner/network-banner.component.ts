import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { HttpNotices } from '../../../core/http';
import { StatusBannerComponent } from './status-banner.component';

/**
 * « Connexion perdue · vos brouillons sont conservés » (fiche 00 §7, planche 29) : lit l'état hors
 * ligne posé par offline.interceptor, disparaît seul au retour du réseau ; « Réessayer maintenant »
 * rejoue les requêtes retenues.
 */
@Component({
  selector: 'pm-network-banner',
  imports: [StatusBannerComponent],
  template: `
    @if (notices.offline()) {
      <pm-status-banner
        level="warning"
        [message]="message"
        [actionLabel]="retryLabel"
        (action)="notices.retryNow()"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkBannerComponent {
  protected readonly notices = inject(HttpNotices);
  protected readonly message = $localize`:Bandeau hors ligne@@banner.offline.message:Connexion perdue · vos brouillons sont conservés sur cet appareil et seront renvoyés automatiquement.`;
  protected readonly retryLabel = $localize`:Bouton du bandeau hors ligne@@banner.offline.retry:Réessayer maintenant`;
}
