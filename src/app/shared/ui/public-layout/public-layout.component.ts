import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { AppLocale } from '../../../core/i18n';

/** Routes publiques (fiches 08, 24 ; pied de page, fiche 00 §4). */
export const PUBLIC_PATHS = {
  directory: '/annuaire',
  howItWorks: '/comment-ca-marche',
  login: '/connexion',
  home: '/patients',
  legal: '/mentions-legales',
  privacy: '/confidentialite',
  accessibility: '/accessibilite',
} as const;

/**
 * Layout des pages publiques (fiche 00 §4) : bandeau logo PsyMate + « Annuaire des praticiens »,
 * liens Annuaire et Comment ça marche, bouton secondaire Espace praticien (→ /connexion, ou
 * /patients si déjà connecté), `<main id="main">` avec le contenu, pied mentions légales ·
 * confidentialité · accessibilité, sans numéro d'urgence (G Q20). `narrow` : conteneur centré 480 px
 * des formulaires publics ; `wide` (UX-A8) : contenu jusqu'à 1 280 px (annuaire, maquette 08) ;
 * sinon 1 120 px. Sans garde ni SessionStore : la coquille passe `authenticated`.
 */
@Component({
  selector: 'pm-public-layout',
  imports: [MatButtonModule, RouterLink],
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

  protected readonly paths = PUBLIC_PATHS;
  protected readonly practitionerPath = computed(() =>
    this.authenticated() ? PUBLIC_PATHS.home : PUBLIC_PATHS.login,
  );
}
