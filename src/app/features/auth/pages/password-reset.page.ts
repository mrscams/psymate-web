import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { AUTH_PATHS } from '../../../core/auth';
import { PasswordResetStore } from '../data/register.store';

/**
 * /mot-de-passe-oublie (fiche 11, lien « Mot de passe oublié ? ») : demande du lien de
 * réinitialisation, POST /api/auth/password-reset/request → 202 quoi qu'il arrive (jamais
 * d'énumération). La page qui consomme le lien (nouveau mot de passe) n'a pas de fiche : plus tard.
 */
@Component({
  selector: 'pm-password-reset-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  providers: [PasswordResetStore],
  template: `
    <section class="card">
      <h1 id="reset-title" i18n="Titre de l'écran mot de passe oublié@@auth.reset.title">
        Mot de passe oublié
      </h1>
      @if (store.status() === 'sent') {
        <p class="sent" role="status" i18n="Confirmation d'envoi du lien@@auth.reset.sent">
          Si un compte existe pour cette adresse, un e-mail avec un lien de réinitialisation vient
          de partir. Le lien est valable 30 minutes.
        </p>
        <a [routerLink]="loginPath" i18n="Retour à la connexion@@auth.reset.back"
          >Retour à la connexion</a
        >
      } @else {
        <p class="intro" i18n="Explication de l'écran mot de passe oublié@@auth.reset.intro">
          Indiquez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau
          mot de passe.
        </p>
        <form [formGroup]="form" (ngSubmit)="submit()" aria-labelledby="reset-title" novalidate>
          <mat-form-field appearance="outline">
            <mat-label i18n="Champ e-mail de la connexion@@auth.login.email"
              >Adresse e-mail</mat-label
            >
            <input matInput type="email" formControlName="email" autocomplete="username" required />
            @if (form.controls.email.hasError('required')) {
              <mat-error i18n="E-mail manquant@@auth.login.email.required"
                >Saisissez votre adresse e-mail.</mat-error
              >
            } @else if (form.controls.email.invalid) {
              <mat-error i18n="E-mail mal formé@@auth.login.email.invalid"
                >Cette adresse e-mail n'est pas valide.</mat-error
              >
            }
          </mat-form-field>
          @if (message(); as text) {
            <p class="banner" role="alert">{{ text }}</p>
          }
          <button
            mat-flat-button
            type="submit"
            [disabled]="store.status() === 'submitting'"
            i18n="Bouton d'envoi du lien de réinitialisation@@auth.reset.submit"
          >
            Envoyer le lien
          </button>
          <a [routerLink]="loginPath" i18n="Retour à la connexion@@auth.reset.back"
            >Retour à la connexion</a
          >
        </form>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      max-width: 420px;
      margin: 0 auto;
      padding: 32px;
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
    }
    h1 {
      margin: 0 0 8px;
      font: var(--mat-sys-headline-small);
      color: var(--text-primary);
    }
    .intro,
    .sent {
      margin: 0 0 16px;
      color: var(--text-secondary);
    }
    .sent {
      padding: 12px 16px;
      border-radius: 10px;
      background: var(--success-bg);
      color: var(--success);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .banner {
      margin: 0;
      padding: 12px 16px;
      border-radius: 10px;
      color: var(--danger);
      background: var(--danger-bg);
    }
    button[type='submit'] {
      height: 46px;
    }
    a {
      color: var(--primary);
      text-underline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetPage {
  protected readonly store = inject(PasswordResetStore);
  protected readonly loginPath = AUTH_PATHS.login;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });

  protected readonly message = computed(() => {
    const problem = this.store.problem();
    if (!problem) return null;
    return problem.status === 422
      ? $localize`:Demande refusée, e-mail mal formé@@auth.reset.error.invalid:Vérifiez l'adresse e-mail saisie.`
      : $localize`:Demande impossible, serveur ou réseau@@auth.reset.error.unavailable:Envoi impossible pour le moment. Réessayez dans un instant.`;
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.store.request(this.form.getRawValue().email.trim());
  }
}
