import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'caseload' },
  {
    path: 'caseload',
    loadComponent: () => import('./caseload/caseload').then((m) => m.Caseload),
  },
  {
    path: 'patients/:id',
    loadComponent: () => import('./patient-detail/patient-detail').then((m) => m.PatientDetail),
  },
  { path: '**', redirectTo: 'caseload' },
];
