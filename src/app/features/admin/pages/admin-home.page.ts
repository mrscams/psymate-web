import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Page provisoire de /admin (M1-17) : elle existe pour que la fin de la première connexion ait une
 * destination et que les gardes (rôle, 2FA) se vérifient de bout en bout. Les écrans
 * d'administration (fiches 19 à 23) arrivent avec M7-07, qui remplace ce composant.
 */
@Component({
  selector: 'pm-admin-home-page',
  template: `
    <section class="home">
      <h1 i18n="Titre provisoire de l'administration@@admin.home.title">Administration</h1>
      <p i18n="Texte provisoire de l'administration@@admin.home.body">
        Votre compte administrateur est prêt : mot de passe choisi et double authentification
        active. Les écrans d'administration (vérifications, comptes, journal) arrivent avec une
        prochaine version.
      </p>
    </section>
  `,
  styles: `
    .home {
      max-width: 720px;
      color: var(--text-primary);
    }
    h1 {
      margin: 0 0 8px;
      font: var(--mat-sys-headline-small);
    }
    p {
      margin: 0;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHomePage {}
