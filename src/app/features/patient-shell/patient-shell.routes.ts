import { Routes } from '@angular/router';

/**
 * Montées sous /patients/:id par app.routes.ts (authGuard, statusGuard) : la page patient et ses
 * onglets (B2), chacun chargé à la demande avec son data.tab : overview (M4-05), session (UX-S3 :
 * l'onglet « Séance », tant qu'une séance est ouverte), timeline (M3-02), graph (M2-06) et search
 * (M4-08).
 * /patients/:id/overview (destination de M1-06 après création) renvoie sur l'onglet 1,
 * /patients/:id, celui que l'en-tête désigne.
 * La page est chargée à la demande : app.component importe l'index (aide des raccourcis) sans
 * embarquer le dossier dans le paquet initial.
 */
export const PATIENT_SHELL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/patient-shell.page').then((m) => m.PatientShellPage),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('../overview').then((m) => m.loadOverviewPage()),
        // UX-S6 : la vue d'ensemble occupe toute la largeur (proposition 02, décision 4 du
        // 14 novembre 2026), comme l'onglet Séance.
        data: { tab: 'overview', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.overview.pageTitle:Vue d'ensemble · PsyMate`,
      },
      { path: 'overview', pathMatch: 'full', redirectTo: '' },
      {
        path: 'session',
        loadComponent: () => import('./pages/session-tab.page').then((m) => m.SessionTabPage),
        // UX-S5 : l'onglet Séance occupe toute la largeur (propositions 04 et 04b) ; Timeline,
        // Graphe et Recherche gardent les 1 120 px jusqu'à leur propre tâche.
        data: { tab: 'session', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.session.pageTitle:Séance · PsyMate`,
      },
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
