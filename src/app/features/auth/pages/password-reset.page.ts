import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { AUTH_PATHS } from '../../../core/auth';
import { PasswordResetStore } from '../data/register.store';

/**
 * Durée de validité du lien de réinitialisation, en minutes : celle du contrat
 * (POST /api/auth/password-reset/request et /confirm : « usage unique, 30 minutes »).
 */
export const PASSWORD_RESET_LINK_MINUTES = 30;

/**
 * /mot-de-passe-oublie (fiche 26, étape 1 sur 2, UX-D4) : demande du lien de réinitialisation,
 * POST /api/auth/password-reset/request → 202 quoi qu'il arrive (jamais d'énumération). Textes de
 * confiance de la maquette : durée du lien, message identique qu'un compte existe ou non. Le
 * formulaire reste en place après l'envoi (nouvelle demande possible, elle remplace le lien).
 */
@Component({
  selector: 'pm-password-reset-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule],
  providers: [PasswordResetStore],
  templateUrl: './password-reset.page.html',
  styleUrl: './password-reset.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetPage {
  protected readonly store = inject(PasswordResetStore);
  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly minutes = PASSWORD_RESET_LINK_MINUTES;

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

  protected emailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    if (this.store.status() === 'submitting') return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.store.request(this.form.getRawValue().email.trim());
  }
}
