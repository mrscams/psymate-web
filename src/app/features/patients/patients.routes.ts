import { Routes } from '@angular/router';

import { OverviewPlaceholderPage } from './pages/overview-placeholder.page';
import { PatientFormPage } from './pages/patient-form.page';
import { PatientListPage } from './pages/patient-list.page';

/**
 * Montées sous /patients par app.routes.ts (authGuard, statusGuard) : la liste (fiche 01), la
 * création et la fiche (fiche 16). `:id/overview` est provisoire (destination après création)
 * jusqu'au shell patient de M1-07.
 */
export const PATIENTS_ROUTES: Routes = [
  {
    path: '',
    component: PatientListPage,
    title: $localize`:Titre d'onglet de la liste des patients@@patients.list.pageTitle:Mes patients · PsyMate`,
  },
  {
    path: 'nouveau',
    component: PatientFormPage,
    title: $localize`:Titre d'onglet de la création@@patients.form.newPageTitle:Nouveau dossier · PsyMate`,
  },
  {
    path: ':id/fiche',
    component: PatientFormPage,
    title: $localize`:Titre d'onglet de la fiche@@patients.form.pageTitle:Fiche · PsyMate`,
  },
  {
    path: ':id/overview',
    component: OverviewPlaceholderPage,
    title: $localize`:Titre d'onglet provisoire de la vue d'ensemble@@patients.overview.pageTitle:Vue d'ensemble · PsyMate`,
  },
];
