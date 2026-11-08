import { Routes } from '@angular/router';

import { DataExportPage } from './pages/data-export.page';
import { EmotionsPage } from './pages/emotions.page';
import { PreferencesPage } from './pages/preferences.page';
import { ProfilePage } from './pages/profile.page';
import { SecurityPage, TWO_FACTOR_SEGMENT } from './pages/security.page';
import { TagsPage } from './pages/tags.page';
import { VerificationPage } from './pages/verification.page';

/** Montées sous /mon-compte par app.routes.ts (authGuard, statusGuard). */
export const ACCOUNT_ROUTES: Routes = [
  // /mon-compte seul : les préférences (fiche 14) ; le dossier professionnel a son lien dans le bandeau d'état.
  { path: '', pathMatch: 'full', redirectTo: 'preferences' },
  {
    path: 'dossier-professionnel',
    component: VerificationPage,
    title: $localize`:Titre d'onglet du dossier professionnel@@account.verification.pageTitle:Dossier professionnel · PsyMate`,
  },
  {
    path: 'profil-public',
    component: ProfilePage,
    title: $localize`:Titre d'onglet du profil public@@profile.pageTitle:Profil public · PsyMate`,
  },
  {
    path: 'preferences',
    component: PreferencesPage,
    title: $localize`:Titre d'onglet des préférences@@preferences.pageTitle:Préférences · PsyMate`,
  },
  {
    path: 'emotions',
    component: EmotionsPage,
    title: $localize`:Titre d'onglet des émotions personnalisées@@vocabulary.pageTitle:Émotions personnalisées · PsyMate`,
  },
  {
    path: 'tags',
    component: TagsPage,
    title: $localize`:Titre d'onglet des tags@@vocabulary.tags.pageTitle:Tags · PsyMate`,
  },
  {
    path: 'securite',
    component: SecurityPage,
    title: $localize`:Titre d'onglet de Compte et sécurité@@account.security.pageTitle:Compte et sécurité · PsyMate`,
    // /mon-compte/securite/2fa : même page, le panneau d'activation ouvert (fiche 18 B).
    children: [{ path: TWO_FACTOR_SEGMENT, children: [] }],
  },
  {
    path: 'donnees',
    component: DataExportPage,
    title: $localize`:Titre d'onglet de Données et export@@account.data.pageTitle:Données et export · PsyMate`,
  },
];
