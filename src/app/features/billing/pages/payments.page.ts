import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StateComponent } from '../../../shared/ui';

/**
 * Onglet Paiements (/facturation/paiements, fiche 37) : journal des encaissements et export.
 * Socle M15-14 : page minimale à l'état « chargement », sans appel d'API ; l'écran arrive avec M15-20.
 */
@Component({
  selector: 'pm-payments-page',
  imports: [StateComponent],
  template: '<pm-state kind="loading" skeleton="row" [lines]="6" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsPage {}
