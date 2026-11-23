import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { LocaleLink, localeName, textDirection } from '../../../core/i18n';
import { PUBLIC_PATHS } from './public-paths';

/**
 * Haut du layout public (fiche 00 §4) : lien d'évitement vers `#main`, bandeau logo PsyMate +
 * « Annuaire des praticiens », liens Annuaire et Comment ça marche, liens de langue (les autres
 * langues, chacune écrite dans sa propre langue), bouton secondaire Espace praticien (→ /connexion,
 * ou /patients si déjà connecté). Posé par `PublicLayoutComponent` et par la coquille, qui garde un
 * seul `<main>` et un seul `<router-outlet>` (UX-A10).
 */
@Component({
  selector: 'pm-public-header',
  // Comme avant UX-A10 : RouterLinkActive n'est pas importé, `routerLinkActive` reste un attribut
  // inerte du gabarit (rendu inchangé ; à traiter dans une tâche dédiée).
  imports: [MatButtonModule, RouterLink],
  templateUrl: './public-header.component.html',
  styleUrl: './public-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeaderComponent {
  readonly authenticated = input(false);
  /** Liens vers la même page dans chacune des autres langues, chacun nommé dans sa langue (M16-29). */
  readonly localeLinks = input.required<readonly LocaleLink[]>();

  protected readonly paths = PUBLIC_PATHS;
  /** Liens de langue avec leur nom et leur sens de lecture (`lang` et `dir` de la langue visée). */
  protected readonly locales = computed(() =>
    this.localeLinks().map((link) => ({
      ...link,
      name: localeName(link.locale),
      dir: textDirection(link.locale),
    })),
  );
  protected readonly practitionerPath = computed(() =>
    this.authenticated() ? PUBLIC_PATHS.home : PUBLIC_PATHS.login,
  );
}
