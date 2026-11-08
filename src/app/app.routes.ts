import { Routes } from '@angular/router';

import { authGuard, roleGuard, statusGuard } from './core/auth';

// Une entrée lazy par feature (index.ts public) + gardes (handbook §3, §8).
// data.layout (app.component) : public pour l'identité, admin pour /admin, practitioner par défaut.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  // Identité, publique : /connexion, et les destinations du triage (provisoires en M0-07).
  {
    path: '',
    data: { layout: 'public' },
    loadChildren: () => import('./features/auth').then((m) => m.AUTH_ROUTES),
  },
  // Pages publiques (M5-05, fiches 08, 09, 24) : sans garde ni session, prérendues (app.routes.server.ts).
  {
    path: '',
    data: { layout: 'public' },
    loadChildren: () => import('./features/public').then((m) => m.PUBLIC_ROUTES),
  },
  {
    path: 'patients',
    canActivate: [authGuard, statusGuard],
    loadChildren: () => import('./features/patients').then((m) => m.PATIENTS_ROUTES),
  },
  // Page patient (M1-07, B2) : en-tête permanent et onglets. Après 'patients' : la liste, la
  // création et la fiche (:id/fiche) y sont reconnues d'abord, le reste de /patients/:id/** arrive ici.
  {
    path: 'patients/:id',
    canActivate: [authGuard, statusGuard],
    loadChildren: () => import('./features/patient-shell').then((m) => m.PATIENT_SHELL_ROUTES),
  },
  // Mon compte (fiche 00 §3) : dossier professionnel (M1-15), préférences (M1-16)…
  {
    path: 'mon-compte',
    canActivate: [authGuard, statusGuard],
    loadChildren: () => import('./features/account').then((m) => m.ACCOUNT_ROUTES),
  },
  // Administration (fiche 00 §5) : réservée au rôle admin avec 2FA (garde dans la feature, G Q5) ;
  // page provisoire jusqu'à M7-07.
  {
    path: 'admin',
    canActivate: [authGuard, statusGuard, roleGuard('admin')],
    data: { layout: 'admin' },
    loadChildren: () => import('./features/admin').then((m) => m.ADMIN_ROUTES),
  },
  // Démonstration des composants partagés (M0-09) : revue visuelle et axe-core, hors du produit.
  {
    path: '_demo',
    data: { layout: 'bare' },
    loadComponent: () => import('./demo/demo.page').then((m) => m.DemoPage),
    title: 'Démonstration · PsyMate',
  },
  { path: '**', redirectTo: 'patients' },
];
