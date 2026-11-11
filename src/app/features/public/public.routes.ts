import { Routes } from '@angular/router';

import { DirectoryPage } from './pages/directory.page';
import { HowItWorksPage } from './pages/how-it-works.page';
import { PractitionerPage } from './pages/practitioner.page';

/**
 * Pages publiques (fiches 08, 09, 24), montées à la racine par app.routes.ts avec le layout public,
 * sans garde ni session. Pleine largeur (`wide`) : la colonne de 480 px est celle des formulaires.
 * Prérendu : app.routes.server.ts.
 */
export const PUBLIC_ROUTES: Routes = [
  {
    path: 'annuaire',
    component: DirectoryPage,
    data: { wide: true },
    title: $localize`:Titre d'onglet de l'annuaire@@public.directory.pageTitle:Annuaire des praticiens · PsyMate`,
  },
  {
    path: 'praticiens/:slug',
    component: PractitionerPage,
    data: { wide: true },
    title: $localize`:Titre d'onglet de la fiche avant chargement@@public.practitioner.pageTitle:Fiche praticien · PsyMate`,
  },
  {
    path: 'comment-ca-marche',
    component: HowItWorksPage,
    data: { wide: true },
    title: $localize`:Titre d'onglet de comment ça marche@@public.how.pageTitle:Comment ça marche · PsyMate`,
  },
  // Pied public (fiche 00 §4 ; UX-A6) : pages statiques chargées à la demande, chemins de PUBLIC_PATHS.
  {
    path: 'mentions-legales',
    loadComponent: () => import('./pages/legal-notice.page').then((m) => m.LegalNoticePage),
    data: { wide: true },
    title: $localize`:Titre d'onglet des mentions légales@@public.legal.pageTitle:Mentions légales · PsyMate`,
  },
  {
    path: 'confidentialite',
    loadComponent: () => import('./pages/privacy.page').then((m) => m.PrivacyPage),
    data: { wide: true },
    title: $localize`:Titre d'onglet de la page confidentialité@@public.privacy.pageTitle:Confidentialité · PsyMate`,
  },
  {
    path: 'accessibilite',
    loadComponent: () => import('./pages/accessibility.page').then((m) => m.AccessibilityPage),
    data: { wide: true },
    title: $localize`:Titre d'onglet de la page accessibilité@@public.accessibility.pageTitle:Accessibilité · PsyMate`,
  },
];
