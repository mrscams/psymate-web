import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StateComponent } from '../../../shared/ui';

/**
 * Onglet Factures (/facturation, fiche 33) : bandeau de chiffres, filtres et liste des factures.
 * Socle M15-14 : page minimale à l'état « chargement », sans appel d'API ; l'écran arrive avec M15-16.
 */
@Component({
  selector: 'pm-invoices-page',
  imports: [StateComponent],
  template: '<pm-state kind="loading" skeleton="row" [lines]="6" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesPage {}
