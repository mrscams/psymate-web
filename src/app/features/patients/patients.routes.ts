import { Routes } from '@angular/router';

import { PatientListPage } from './pages/patient-list.page';

/** Montées sous /patients par app.routes.ts (authGuard, statusGuard). */
export const PATIENTS_ROUTES: Routes = [
  {
    path: '',
    component: PatientListPage,
    title: $localize`:Titre d'onglet de la liste des patients@@patients.list.pageTitle:Mes patients · PsyMate`,
  },
];
