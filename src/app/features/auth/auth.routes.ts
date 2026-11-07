import { Routes } from '@angular/router';

import { guestGuard } from '../../core/auth';
import { AccountStatePage } from './pages/account-state.page';
import { LoginPage } from './pages/login.page';

/** Routes publiques de l'identité, montées à la racine par app.routes.ts. */
export const AUTH_ROUTES: Routes = [
  {
    path: 'connexion',
    canActivate: [guestGuard],
    component: LoginPage,
    title: $localize`:Titre d'onglet de la connexion@@auth.login.pageTitle:Connexion · PsyMate`,
  },
  {
    path: 'confirmer-email',
    component: AccountStatePage,
    data: { kind: 'confirm-email' },
    title: $localize`:Titre d'onglet, e-mail à confirmer@@auth.state.confirmEmail.pageTitle:Confirmer l'e-mail · PsyMate`,
  },
  {
    path: 'compte-suspendu',
    component: AccountStatePage,
    data: { kind: 'suspended' },
    title: $localize`:Titre d'onglet, compte suspendu@@auth.state.suspended.pageTitle:Compte suspendu · PsyMate`,
  },
  {
    path: 'premiere-connexion',
    component: AccountStatePage,
    data: { kind: 'first-login' },
    title: $localize`:Titre d'onglet, première connexion@@auth.state.firstLogin.pageTitle:Première connexion · PsyMate`,
  },
];
