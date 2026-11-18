import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StateComponent } from '../../../shared/ui';

/**
 * Onglet 4 du dossier, /patients/:id/profile (fiche 30, G Q52 à Q57) : ce qui décrit la personne,
 * rangé en quatre rubriques. Squelette posé par M13-05 : le titre de l'onglet et l'état
 * « chargement » de shared/ui/state, sans aucun appel d'API (le client du contrat 0.14.0 arrive par
 * M13-04 ; la lecture des informations est M13-06). Pas de bloc de saisie sur cet onglet (G Q56) :
 * le shell ne le pose que sur l'onglet Séance.
 */
@Component({
  selector: 'pm-profile360-page',
  imports: [StateComponent],
  templateUrl: './profile360.page.html',
  styleUrl: './profile360.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile360Page {}
