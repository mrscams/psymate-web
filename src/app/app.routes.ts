import { Routes } from '@angular/router';

import { authGuard, statusGuard } from './core/auth';

// Une entrée lazy par feature (index.ts public) + gardes (handbook §3, §8).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  // Identité, publique : /connexion, et les destinations du triage (provisoires en M0-07).
  { path: '', loadChildren: () => import('./features/auth').then((m) => m.AUTH_ROUTES) },
  {
    path: 'patients',
    canActivate: [authGuard, statusGuard],
    loadChildren: () => import('./features/patients').then((m) => m.PATIENTS_ROUTES),
  },
  { path: '**', redirectTo: 'patients' },
];
