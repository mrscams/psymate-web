import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StateComponent } from '../../../shared/ui';
import {
  CATEGORY_META,
  countLabel,
  initialOf,
  ProfileCategory,
  ProfileItem,
} from '../data/profile360.model';
import { ProfileIconComponent } from './profile-icon.component';

/**
 * La rubrique affichée du Profil 360 (fiche 30, Structure 2), en lecture : en-tête (icône, nom,
 * phrase d'aide et nombre d'informations, annoncé par aria-live au changement de rubrique), puis les
 * informations dans l'ordre reçu, titre et détail seulement (G Q53) :
 * - Histoire et souvenirs : fil chronologique (`<ol>`), la période à gauche, lue avant le titre ;
 *   le point et le trait sont décoratifs ;
 * - Famille et entourage : une pastille à la première lettre du titre ;
 * - Santé et antécédents, Valeurs et projets : une ligne par information.
 * Rubrique vide dans un profil non vide : « Rien dans cette rubrique pour l'instant ».
 * Les informations ne sont pas encore activables : le panneau de modification est M13-07.
 */
@Component({
  selector: 'pm-profile-rubric',
  imports: [ProfileIconComponent, StateComponent],
  templateUrl: './profile-rubric.component.html',
  styleUrl: './profile-rubric.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRubricComponent {
  readonly category = input.required<ProfileCategory>();
  /** Les informations de la rubrique, dans l'ordre du serveur (jamais retriées ici). */
  readonly items = input.required<readonly ProfileItem[]>();

  protected readonly meta = computed(() => CATEGORY_META[this.category()]);
  protected readonly count = computed(() => countLabel(this.items().length));
  protected readonly initialOf = initialOf;
}
