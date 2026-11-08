import { Routes } from '@angular/router';

import { PatientShellPage } from './pages/patient-shell.page';
import { TabPlaceholderPage } from './pages/tab-placeholder.page';

/**
 * Montées sous /patients/:id par app.routes.ts (authGuard, statusGuard) : la page patient et ses
 * onglets (B2). Chaque tâche remplace la route de son onglet par sa page en gardant data.tab :
 * timeline (M3-02), graph (M2-06) et search (M4-08) sont en place ; overview (M4-05) est encore
 * la page provisoire.
 * /patients/:id/overview (destination de M1-06 après création) renvoie sur l'onglet 1,
 * /patients/:id, celui que l'en-tête désigne.
 */
export const PATIENT_SHELL_ROUTES: Routes = [
  {
    path: '',
    component: PatientShellPage,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: TabPlaceholderPage,
        data: { tab: 'overview' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.overview.pageTitle:Vue d'ensemble · PsyMate`,
      },
      { path: 'overview', pathMatch: 'full', redirectTo: '' },
      {
        path: 'timeline',
        loadComponent: () => import('../timeline').then((m) => m.TimelinePage),
        data: { tab: 'timeline' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.timeline.pageTitle:Timeline · PsyMate`,
      },
      {
        path: 'graph',
        loadComponent: () => import('../graph').then((m) => m.loadGraphPage()),
        data: { tab: 'graph' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.graph.pageTitle:Graphe · PsyMate`,
      },
      {
        path: 'search',
        loadComponent: () => import('../search').then((m) => m.loadSearchPage()),
        data: { tab: 'search' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.search.pageTitle:Recherche · PsyMate`,
      },
    ],
  },
];
