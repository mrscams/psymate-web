import { Routes } from '@angular/router';

/**
 * Montées sous /patients/:id par app.routes.ts (authGuard, statusGuard) : la page patient et ses
 * onglets (B2), chacun chargé à la demande avec son data.tab : overview (M4-05), session (UX-S3 :
 * l'onglet « Séance », tant qu'une séance est ouverte), timeline (M3-02), graph (M2-06), profile
 * (M13-05, fiche 30 : l'onglet 4 « Profil 360 », features/profile360) et search (M4-08).
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
        // UX-S5 : l'onglet Séance occupe toute la largeur (propositions 04 et 04b) ; la Recherche
        // garde les 1 120 px jusqu'à sa propre tâche.
        data: { tab: 'session', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.session.pageTitle:Séance · PsyMate`,
      },
      {
        path: 'timeline',
        loadComponent: () => import('../timeline').then((m) => m.TimelinePage),
        // UX-S9 : la timeline en pleine largeur, flux et colonne de résumé (proposition 03).
        data: { tab: 'timeline', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.timeline.pageTitle:Timeline · PsyMate`,
      },
      {
        path: 'graph',
        loadComponent: () => import('../graph').then((m) => m.loadGraphPage()),
        // Le graphe en pleine largeur, comme les autres onglets du dossier (22 novembre 2026).
        data: { tab: 'graph', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.graph.pageTitle:Graphe · PsyMate`,
      },
      {
        path: 'profile',
        loadComponent: () => import('../profile360').then((m) => m.loadProfile360Page()),
        // M13-05 (G Q52) : le Profil 360 en pleine largeur (menu des rubriques et contenu, fiche 30).
        data: { tab: 'profile', contentWidth: 'full' },
        title: $localize`:Titre d'onglet du dossier@@patientShell.profile.pageTitle:Profil 360 · PsyMate`,
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
