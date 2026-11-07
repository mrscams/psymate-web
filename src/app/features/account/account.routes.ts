import { Routes } from '@angular/router';

import { PreferencesPage } from './pages/preferences.page';
import { VerificationPage } from './pages/verification.page';

/** Montées sous /mon-compte par app.routes.ts (authGuard, statusGuard). */
export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dossier-professionnel' },
  {
    path: 'dossier-professionnel',
    component: VerificationPage,
    title: $localize`:Titre d'onglet du dossier professionnel@@account.verification.pageTitle:Dossier professionnel · PsyMate`,
  },
  {
    path: 'preferences',
    component: PreferencesPage,
    title: $localize`:Titre d'onglet des préférences@@preferences.pageTitle:Préférences · PsyMate`,
  },
];
