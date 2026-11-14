import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';

import { subjectLabel, SubjectVocabulary } from '../../core/i18n';
import { PatientFormPage } from './pages/patient-form.page';
import { PatientListPage } from './pages/patient-list.page';

/** Titre d'onglet qui suit la désignation patient / client (préférence, coach). */
const listTitle: ResolveFn<string> = () => {
  const subjects = subjectLabel(inject(SubjectVocabulary).label(), 'many');
  return $localize`:Titre d'onglet de la liste des patients@@patients.list.pageTitle:Mes ${subjects}:subjects: · PsyMate`;
};

const newTitle: ResolveFn<string> = () => {
  const subject = subjectLabel(inject(SubjectVocabulary).label(), 'one');
  return $localize`:Titre d'onglet de la création@@patients.form.newPageTitle:Nouveau ${subject}:subject: · PsyMate`;
};

/**
 * Montées sous /patients par app.routes.ts (authGuard, statusGuard) : la liste (fiche 01), la
 * création et la fiche (fiche 16). Le dossier lui-même (/patients/:id et ses onglets, dont
 * /patients/:id/overview, destination après création) est features/patient-shell (M1-07).
 */
export const PATIENTS_ROUTES: Routes = [
  {
    path: '',
    component: PatientListPage,
    title: listTitle,
    // Proposition 01 (UX-S7) : la liste en pleine largeur, la page pose ses marges (UX-S5).
    data: { contentWidth: 'full' },
  },
  {
    path: 'nouveau',
    component: PatientFormPage,
    title: newTitle,
  },
  {
    path: ':id/fiche',
    component: PatientFormPage,
    title: $localize`:Titre d'onglet de la fiche@@patients.form.pageTitle:Fiche · PsyMate`,
  },
];
