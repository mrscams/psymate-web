import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { VerificationStatus } from '../../../core/auth';
import { ACCOUNT_PATHS } from '../app-bar/app-bar.component';
import { BannerLevel, StatusBannerComponent } from './status-banner.component';

export interface VerificationBanner {
  level: BannerLevel;
  message: string;
}

/**
 * Texte du bandeau d'état du dossier professionnel (fiche 13, repris sur toutes les pages
 * praticien, fiche 00 §1) ; null quand rien n'est à dire (approved, ou statut inconnu). Les statuts
 * email_pending, rejected, suspended et closed sont redirigés avant d'arriver ici (core/auth).
 */
export function verificationBanner(status: VerificationStatus | null): VerificationBanner | null {
  switch (status) {
    case 'docs_pending':
      return {
        level: 'warning',
        message: $localize`:Bandeau d'état, justificatifs attendus@@banner.verification.docsPending:Votre dossier professionnel est incomplet. Déposez vos justificatifs pour être vérifié·e.`,
      };
    case 'under_review':
      return {
        level: 'warning',
        message: $localize`:Bandeau d'état, dossier en vérification@@banner.verification.underReview:Votre dossier professionnel est en cours de vérification. Vous pouvez utiliser l'application pour vos patients ; l'annuaire public sera disponible après validation.`,
      };
    case 'needs_more':
      return {
        level: 'warning',
        message: $localize`:Bandeau d'état, complément demandé@@banner.verification.needsMore:Dossier professionnel : un complément vous est demandé.`,
      };
    default:
      return null;
  }
}

/** `<pm-verification-banner [status]="session.verificationStatus()" />` : rien quand approved. */
@Component({
  selector: 'pm-verification-banner',
  imports: [StatusBannerComponent],
  template: `
    @if (banner(); as banner) {
      <pm-status-banner
        [level]="banner.level"
        [message]="banner.message"
        [actionLabel]="actionLabel"
        [actionLink]="actionLink"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationBannerComponent {
  readonly status = input<VerificationStatus | null>(null);

  protected readonly banner = computed(() => verificationBanner(this.status()));
  protected readonly actionLabel = $localize`:Lien du bandeau d'état vers le dossier@@banner.verification.action:Voir le dossier`;
  protected readonly actionLink = ACCOUNT_PATHS.verification;
}
