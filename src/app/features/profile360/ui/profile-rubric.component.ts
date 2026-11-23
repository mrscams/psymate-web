import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { formatLocale } from '../../../core/i18n';
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
 * - Histoire et souvenirs : fil chronologique (`<ol>`), la période en début de ligne (à gauche, à
 *   droite en arabe), lue avant le titre ; le point et le trait sont décoratifs ;
 * - Famille et entourage : une pastille à la première lettre du titre (graphème, sans capitale pour
 *   une lettre arabe) ;
 * - Santé et antécédents, Valeurs et projets : une ligne par information.
 * Rubrique vide dans un profil non vide : « Rien dans cette rubrique pour l'instant ».
 * M13-07 : chaque information est un bouton nommé par son contenu (clic, Entrée) qui ouvre le panneau
 * en modification (`edit`) ; en lecture seule (patient archivé), un simple élément de liste. Le
 * titre de la rubrique peut recevoir le focus (après un retrait, l'information n'existe plus).
 * Contenu saisi (titre, détail, période) en `dir="auto"` : chacun dans son sens, dans les trois
 * langues (G Q77).
 */
@Component({
  selector: 'pm-profile-rubric',
  imports: [NgTemplateOutlet, ProfileIconComponent, StateComponent],
  templateUrl: './profile-rubric.component.html',
  styleUrl: './profile-rubric.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRubricComponent {
  readonly category = input.required<ProfileCategory>();
  /** Les informations de la rubrique, dans l'ordre du serveur (jamais retriées ici). */
  readonly items = input.required<readonly ProfileItem[]>();
  /** Faux en lecture seule (patient archivé) : les informations ne sont pas activables. */
  readonly editable = input(false);
  /** Clic ou Entrée sur une information : le panneau s'ouvre en modification. */
  readonly edit = output<ProfileItem>();

  protected readonly meta = computed(() => CATEGORY_META[this.category()]);
  protected readonly count = computed(() => countLabel(this.items().length));
  /** Locale de formatage du bundle (Q73) : jamais LOCALE_ID brut. */
  private readonly locale = formatLocale(inject(LOCALE_ID));

  /** Lettre de la pastille de Famille, découpée et mise en capitale selon la langue (Q73, Q76). */
  protected initialOf(title: string): string {
    return initialOf(title, this.locale);
  }
}
