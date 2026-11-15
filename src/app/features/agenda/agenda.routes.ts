import { Routes } from '@angular/router';

import { AgendaPage } from './pages/agenda.page';

/**
 * Montées sous /agenda par app.routes.ts (authGuard, statusGuard). La vue et la date sont dans la
 * requête (`?view=&date=`) ; le rendez-vous ouvert est le segment `rdv/:id` (fiche 15), route
 * sans composant sous la page : la page reste en place quand le détail s'ouvre ou se ferme.
 */
export const AGENDA_ROUTES: Routes = [
  {
    path: '',
    component: AgendaPage,
    title: $localize`:Titre d'onglet de l'agenda@@agenda.pageTitle:Agenda · PsyMate`,
    // Maquette 15 : barre d'outils et grille d'un bord à l'autre, la page pose ses marges.
    data: { contentWidth: 'full' },
    children: [
      { path: '', children: [] },
      { path: 'rdv/:id', children: [] },
    ],
  },
];
