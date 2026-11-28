import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StateComponent } from '../../../shared/ui';

/**
 * Onglet À facturer (/facturation/a-facturer, fiche 34) : séances closes à facturer, par patient.
 * Socle M15-14 : page minimale à l'état « chargement », sans appel d'API ; l'écran arrive avec M15-19.
 */
@Component({
  selector: 'pm-billable-page',
  imports: [StateComponent],
  template: '<pm-state kind="loading" skeleton="row" [lines]="6" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillablePage {}
