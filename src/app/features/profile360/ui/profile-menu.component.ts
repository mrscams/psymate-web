import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CATEGORY_META,
  CATEGORY_QUERY_PARAM,
  countLabel,
  PROFILE_CATEGORIES,
  ProfileCategory,
} from '../data/profile360.model';
import { ProfileIconComponent } from './profile-icon.component';

/**
 * Menu des rubriques du Profil 360 (fiche 30, Structure 1) : titre « Rubriques », puis les quatre
 * rubriques dans l'ordre, chacune avec son icône, son libellé et son nombre d'informations. Chaque
 * rubrique est un lien qui change `?rubrique=` (les autres paramètres sont gardés) ; la rubrique
 * affichée porte `aria-current="true"`. Le compteur est lu avec le libellé (« Famille et entourage
 * 6 informations ») : le nom accessible du lien commence par le libellé visible. Sous 820 px, une
 * rangée défilante sans titre.
 */
@Component({
  selector: 'pm-profile-menu',
  imports: [ProfileIconComponent, RouterLink],
  template: `
    <nav
      class="nav"
      aria-label="Rubriques du profil"
      i18n-aria-label="Nom du menu des rubriques du Profil 360@@profile360.menu.label"
    >
      <p
        class="nav-title"
        aria-hidden="true"
        i18n="Titre du menu des rubriques@@profile360.menu.title"
      >
        Rubriques
      </p>
      @for (category of categories; track category) {
        <a
          class="navb"
          [routerLink]="[]"
          [queryParams]="queryFor(category)"
          queryParamsHandling="merge"
          [attr.aria-current]="category === current() ? 'true' : null"
          [attr.aria-label]="nameOf(category)"
        >
          <span class="isq"><pm-profile-icon [icon]="meta[category].icon" /></span>
          <span class="n">{{ meta[category].label }}</span
          >&ngsp;
          <span class="c">{{ counts()[category] }}</span>
        </a>
      }
    </nav>
  `,
  styleUrl: './profile-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMenuComponent {
  readonly current = input.required<ProfileCategory>();
  readonly counts = input.required<Record<ProfileCategory, number>>();

  protected readonly categories = PROFILE_CATEGORIES;
  protected readonly meta = CATEGORY_META;

  /** `?rubrique=` de la rubrique ; les autres paramètres sont fusionnés par le lien. */
  protected queryFor(category: ProfileCategory): Record<string, string> {
    return { [CATEGORY_QUERY_PARAM]: category };
  }

  /** « Famille et entourage 6 informations » : sans virgule, pour contenir le texte visible (axe, WCAG 2.5.3). */
  protected nameOf(category: ProfileCategory): string {
    const label = CATEGORY_META[category].label;
    const count = countLabel(this.counts()[category]);
    return $localize`:Nom lu d'une rubrique du menu (libellé, nombre d'informations)@@profile360.menu.item:${label}:label: ${count}:count:`;
  }
}
