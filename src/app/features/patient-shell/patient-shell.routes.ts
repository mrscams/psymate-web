import { Routes } from '@angular/router';

import { PatientShellPage } from './pages/patient-shell.page';
import { TabPlaceholderPage } from './pages/tab-placeholder.page';

/**
 * Montées sous /patients/:id par app.routes.ts (authGuard, statusGuard) : la page patient et ses
 * onglets (B2). Les quatre onglets sont provisoires ; chaque tâche remplace la route de son onglet
 * par sa page (M4-05 overview, M3-02 timeline, M2-06 graph, M4-08 search) en gardant data.tab.
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
        component: TabPlaceholderPage,
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
