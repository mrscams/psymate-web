import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StateComponent } from '../../../shared/ui';

/**
 * Éditeur d'une nouvelle facture (/facturation/nouvelle, fiche 35, maquette facturation/03,
 * `.ed-head`) : sa propre barre (retour vers la liste, titre), sans l'en-tête de module.
 * Socle M15-14 : page minimale à l'état « chargement », sans appel d'API ; l'éditeur arrive avec
 * M15-17.
 */
@Component({
  selector: 'pm-new-invoice-page',
  imports: [RouterLink, StateComponent],
  templateUrl: './new-invoice.page.html',
  styleUrl: './new-invoice.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewInvoicePage {
  protected readonly backLabel = $localize`:Bouton de retour de l'éditeur de facture vers la liste@@billing.editor.back:Retour aux factures`;
}
