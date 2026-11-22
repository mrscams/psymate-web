import { Routes } from '@angular/router';

import { DirectoryPage } from './pages/directory.page';
import { HowItWorksPage } from './pages/how-it-works.page';
import { PractitionerPage } from './pages/practitioner.page';
import { BOOKING_LINK_SEGMENTS } from './public-paths';

/**
 * Pages publiques (fiches 08, 09, 24), montées à la racine par app.routes.ts avec le layout public,
 * sans garde ni session. Pleine largeur (`wide`) : la colonne de 480 px est celle des formulaires.
 * L'annuaire (maquette 08, filtres et liste côte à côte) déclare `contentWidth: 'wide'` (UX-A8,
 * UX-A9c) : le layout public lui donne sa largeur de 1 280 px ; les autres pages gardent la largeur
 * par défaut. Prérendu : app.routes.server.ts.
 */
export const PUBLIC_ROUTES: Routes = [
  {
    path: 'annuaire',
    component: DirectoryPage,
    data: { contentWidth: 'wide' },
    title: $localize`:Titre d'onglet de l'annuaire@@public.directory.pageTitle:Annuaire des praticiens · PsyMate`,
  },
  {
    path: 'praticiens/:slug',
    component: PractitionerPage,
    data: { wide: true },
    title: $localize`:Titre d'onglet de la fiche avant chargement@@public.practitioner.pageTitle:Fiche praticien · PsyMate`,
  },
  // Prise de rendez-vous en ligne (fiche 31, G Q60) : chargée à la demande, non prérendue, noindex.
  {
    path: 'praticiens/:slug/rendez-vous',
    loadComponent: () => import('./pages/booking.page').then((m) => m.BookingPage),
    data: { wide: true },
    title: $localize`:Titre d'onglet de la prise de rendez-vous@@public.booking.pageTitle:Prendre rendez-vous · PsyMate`,
  },
  // Pages par lien de la prise de rendez-vous (fiche 32, G Q60, Q62) : ouvertes depuis un e-mail,
  // chargées à la demande, non prérendues (app.routes.server.ts : '**' en rendu client), noindex,
  // referrer no-referrer. Le jeton n'est lu que dans le chemin.
  {
    path: `${BOOKING_LINK_SEGMENTS.verify}/:token`,
    loadComponent: () => import('./pages/booking-verify.page').then((m) => m.BookingVerifyPage),
    data: { wide: true },
    title: $localize`:Titre d'onglet de la vérification d'une demande de rendez-vous@@public.bookingLink.verify.pageTitle:Votre demande de rendez-vous · PsyMate`,
  },
  {
    path: `${BOOKING_LINK_SEGMENTS.manage}/:token`,
    loadComponent: () => import('./pages/booking-manage.page').then((m) => m.BookingManagePage),
    data: { wide: true },
    title: $localize`:Titre d'onglet de la gestion d'un rendez-vous@@public.bookingLink.manage.pageTitle:Votre rendez-vous · PsyMate`,
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
