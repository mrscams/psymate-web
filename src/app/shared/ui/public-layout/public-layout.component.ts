import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { AppLocale } from '../../../core/i18n';
import { PublicFooterComponent } from './public-footer.component';
import { PublicHeaderComponent } from './public-header.component';

export { PUBLIC_PATHS } from './public-paths';

/**
 * Layout des pages publiques (fiche 00 §4) : bandeau logo PsyMate + « Annuaire des praticiens »,
 * liens Annuaire et Comment ça marche, bouton secondaire Espace praticien (→ /connexion, ou
 * /patients si déjà connecté), `<main id="main">` avec le contenu, pied mentions légales ·
 * confidentialité · accessibilité, sans numéro d'urgence (G Q20). `narrow` : conteneur centré 480 px
 * des formulaires publics ; `wide` (UX-A8) : contenu jusqu'à 1 280 px (annuaire, maquette 08) ;
 * sinon 1 120 px. Sans garde ni SessionStore : la coquille passe `authenticated`.
 *
 * UX-A10 : le bandeau (`pm-public-header`), le pied (`pm-public-footer`) et les styles du `<main>`
 * (`_public-main.scss`) sont des pièces séparées ; la coquille les pose elle-même autour de son
 * unique `<router-outlet>`, que ce layout ne reçoit plus par projection.
 */
@Component({
  selector: 'pm-public-layout',
  imports: [PublicFooterComponent, PublicHeaderComponent],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {
  readonly authenticated = input(false);
  /** Conteneur 480 px (connexion, inscription, mot de passe oublié, contact). */
  readonly narrow = input(false);
  /** Contenu jusqu'à 1 280 px (annuaire, maquette 08) ; `narrow` l'emporte s'il est aussi posé. */
  readonly wide = input(false);
  readonly switchHref = input.required<string>();
  readonly switchLang = input.required<AppLocale>();
}
