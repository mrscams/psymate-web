import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Les trois destinations du triage dont l'écran complet vient plus tard. */
export type AccountStateKind = 'confirm-email' | 'suspended' | 'first-login';

/**
 * Page provisoire (M0-07) des destinations du triage : /confirmer-email (fiche 25, M1-18),
 * /compte-suspendu (fiche 27, M1-18), /premiere-connexion (fiche 18 C, M1-17). Elle existe pour que
 * les redirections de statusGuard, afterLogin() et auth-redirect.interceptor aboutissent.
 */
@Component({
  selector: 'pm-account-state-page',
  imports: [RouterLink],
  template: `
    <section class="state">
      <h1>{{ text().title }}</h1>
      <p>{{ text().body }}</p>
      <a routerLink="/connexion" i18n="Lien de retour vers la connexion@@auth.state.back"
        >Retour à la connexion</a
      >
    </section>
  `,
  styles: `
    .state {
      max-width: 480px;
      margin: 0 auto;
    }
    h1 {
      font: var(--mat-sys-headline-small);
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
    }
    a {
      color: var(--primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountStatePage {
  /** Fourni par la donnée de route (withComponentInputBinding). */
  readonly kind = input.required<AccountStateKind>();

  protected readonly text = computed(() => TEXTS[this.kind()]);
}

const TEXTS: Record<AccountStateKind, { title: string; body: string }> = {
  'confirm-email': {
    title: $localize`:Titre provisoire, e-mail à confirmer@@auth.state.confirmEmail.title:Confirmez votre adresse e-mail`,
    body: $localize`:Texte provisoire, e-mail à confirmer@@auth.state.confirmEmail.body:Un lien de confirmation vous a été envoyé. Ouvrez-le pour accéder à votre espace.`,
  },
  suspended: {
    title: $localize`:Titre provisoire, compte suspendu@@auth.state.suspended.title:Compte suspendu`,
    body: $localize`:Texte provisoire, compte suspendu@@auth.state.suspended.body:Votre compte n'est pas actif. Le motif vous a été envoyé par e-mail.`,
  },
  'first-login': {
    title: $localize`:Titre provisoire, première connexion@@auth.state.firstLogin.title:Première connexion`,
    body: $localize`:Texte provisoire, première connexion@@auth.state.firstLogin.body:Votre compte doit d'abord changer son mot de passe et activer la double authentification.`,
  },
};
