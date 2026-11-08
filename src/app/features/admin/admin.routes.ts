import { Routes } from '@angular/router';

import { adminTwoFactorGuard } from './admin-access.guard';

/**
 * Montées sous /admin par app.routes.ts (authGuard, statusGuard, roleGuard('admin'), layout admin
 * avec la barre d'administration). La garde 2FA couvre toutes les pages ; le serveur reste juge
 * (403 TWO_FACTOR_REQUIRED → /premiere-connexion par core/http). Pas de Signalements (G Q26).
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivateChild: [adminTwoFactorGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'validation' },
      {
        path: 'validation',
        loadComponent: () => import('./pages/validation.page').then((m) => m.ValidationPage),
        title: $localize`:Titre d'onglet de la validation@@admin.validation.pageTitle:Validation des praticiens · Administration · PsyMate`,
      },
      {
        path: 'validation/:practitionerId',
        loadComponent: () => import('./pages/validation.page').then((m) => m.ValidationPage),
        title: $localize`:Titre d'onglet de la validation@@admin.validation.pageTitle:Validation des praticiens · Administration · PsyMate`,
      },
      {
        path: 'praticiens',
        loadComponent: () => import('./pages/practitioners.page').then((m) => m.PractitionersPage),
        title: $localize`:Titre d'onglet des praticiens@@admin.practitioners.pageTitle:Praticiens · Administration · PsyMate`,
      },
      {
        path: 'journal',
        loadComponent: () => import('./pages/journal.page').then((m) => m.JournalPage),
        title: $localize`:Titre d'onglet du journal@@admin.journal.pageTitle:Journal · Administration · PsyMate`,
      },
      {
        path: 'vocabulaire',
        loadComponent: () => import('./pages/vocabulary.page').then((m) => m.VocabularyPage),
        title: $localize`:Titre d'onglet du vocabulaire@@admin.vocabulary.pageTitle:Vocabulaire de l'annuaire · Administration · PsyMate`,
      },
      { path: '**', redirectTo: 'validation' },
    ],
  },
];
