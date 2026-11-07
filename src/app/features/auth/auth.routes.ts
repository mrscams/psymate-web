import { Routes } from '@angular/router';

import { guestGuard } from '../../core/auth';
import { firstLoginGuard } from './first-login.guard';
import { ConfirmEmailPage } from './pages/confirm-email.page';
import { LoginPage } from './pages/login.page';
import { PasswordResetPage } from './pages/password-reset.page';
import { RegisterPage } from './pages/register.page';
import { SuspendedPage } from './pages/suspended.page';

/** Routes publiques de l'identité, montées à la racine par app.routes.ts. */
export const AUTH_ROUTES: Routes = [
  {
    path: 'connexion',
    canActivate: [guestGuard],
    component: LoginPage,
    title: $localize`:Titre d'onglet de la connexion@@auth.login.pageTitle:Connexion · PsyMate`,
  },
  {
    path: 'inscription',
    canActivate: [guestGuard],
    component: RegisterPage,
    title: $localize`:Titre d'onglet de l'inscription@@auth.register.pageTitle:Créer un compte · PsyMate`,
  },
  {
    path: 'mot-de-passe-oublie',
    canActivate: [guestGuard],
    component: PasswordResetPage,
    title: $localize`:Titre d'onglet du mot de passe oublié@@auth.reset.pageTitle:Mot de passe oublié · PsyMate`,
  },
  // Fiche 25 (M1-18) : en attente, lien expiré (avant :token, sinon « expire » serait pris pour un jeton), traitement du lien.
  {
    path: 'confirmer-email',
    component: ConfirmEmailPage,
    data: { mode: 'pending' },
    title: $localize`:Titre d'onglet, e-mail à confirmer@@auth.state.confirmEmail.pageTitle:Confirmer l'e-mail · PsyMate`,
  },
  {
    path: 'confirmer-email/expire',
    component: ConfirmEmailPage,
    data: { mode: 'expired' },
    title: $localize`:Titre d'onglet, lien de confirmation expiré@@auth.confirm.expired.pageTitle:Lien expiré · PsyMate`,
  },
  {
    path: 'confirmer-email/:token',
    component: ConfirmEmailPage,
    data: { mode: 'token' },
    title: $localize`:Titre d'onglet, e-mail à confirmer@@auth.state.confirmEmail.pageTitle:Confirmer l'e-mail · PsyMate`,
  },
  // Fiche 27 (M1-18).
  {
    path: 'compte-suspendu',
    component: SuspendedPage,
    title: $localize`:Titre d'onglet, compte suspendu@@auth.state.suspended.pageTitle:Compte suspendu · PsyMate`,
  },
  // Fiche 18 C (M1-17) : écran bloquant avec sa propre barre sombre (layout bare), chargé à part
  // car il embarque les briques de sécurité de features/account.
  {
    path: 'premiere-connexion',
    canActivate: [firstLoginGuard],
    data: { layout: 'bare' },
    loadComponent: () => import('./pages/first-login.page').then((m) => m.FirstLoginPage),
    title: $localize`:Titre d'onglet, première connexion@@auth.state.firstLogin.pageTitle:Première connexion · PsyMate`,
  },
];
