import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EMERGENCY_NUMBERS } from '../public-facts';
import { BookingBarComponent } from './booking-bar.component';

/**
 * Mention d'urgence des pages de prise de rendez-vous (G Q63, fiches 31 et 32) : encart
 * d'avertissement, `role="note"`, placé par la page au-dessus de son action principale. Numéros en
 * liens `tel:` lus dans public-facts.ts, libellés dans $localize. Jamais rouge (fiche 31, Tokens).
 * Ce n'est pas le pied de page de G Q20, qui reste sans numéros.
 */
@Component({
  selector: 'pm-emergency-note',
  imports: [BookingBarComponent],
  template: `
    <pm-booking-bar level="warning" role="note">
      <ng-container
        i18n="Mention d'urgence des pages de rendez-vous (G Q63)@@public.booking.emergency"
        ><strong>PsyMate n'est pas un service d'urgence.</strong> En cas d'urgence, appelez le
        <a [href]="'tel:' + numbers.emergency">{{ numbers.emergency }}</a> (urgences) ou le
        <a [href]="'tel:' + numbers.suicidePrevention">{{ numbers.suicidePrevention }}</a>
        (prévention du suicide).</ng-container
      >
    </pm-booking-bar>
  `,
  styles: `
    :host {
      display: block;
    }

    strong {
      font-weight: 600;
    }

    a {
      color: var(--text-primary);
      font-weight: 600;
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyNoteComponent {
  protected readonly numbers = EMERGENCY_NUMBERS;
}
