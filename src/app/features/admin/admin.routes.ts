import { Routes } from '@angular/router';

import { adminTwoFactorGuard } from './admin-access.guard';
import { AdminHomePage } from './pages/admin-home.page';

/** Montées sous /admin par app.routes.ts (authGuard, statusGuard, roleGuard('admin'), layout admin). */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminTwoFactorGuard],
    component: AdminHomePage,
    title: $localize`:Titre d'onglet de l'administration@@admin.home.pageTitle:Administration · PsyMate`,
  },
];
