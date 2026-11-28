import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StateComponent } from '../../../shared/ui';

/**
 * Onglet Réglages (/facturation/reglages, fiche 39) : identité, TVA, numérotation, règlement.
 * Socle M15-14 : page minimale à l'état « chargement », sans appel d'API ; l'écran arrive avec M15-15.
 */
@Component({
  selector: 'pm-billing-settings-page',
  imports: [StateComponent],
  template: '<pm-state kind="loading" skeleton="block" [lines]="3" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingSettingsPage {}
