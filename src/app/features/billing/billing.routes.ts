import { Routes } from '@angular/router';

import { BillablePage } from './pages/billable.page';
import { BillingPage } from './pages/billing.page';
import { BillingSettingsPage } from './pages/billing-settings.page';
import { InvoicesPage } from './pages/invoices.page';
import { NewInvoicePage } from './pages/new-invoice.page';
import { PaymentsPage } from './pages/payments.page';
import type { BillingTab } from './ui/billing-header.component';

/**
 * Montées sous /facturation par app.routes.ts (authGuard, statusGuard). Cadre du module (fiche 33) :
 * pleine largeur (`contentWidth: 'full'`, la page pose ses marges) ; l'en-tête de module (BillingPage)
 * coiffe les quatre onglets ; l'éditeur (/facturation/nouvelle, fiche 35) a sa propre barre.
 * Les routes à paramètre (/facturation/brouillons/:id, /facturation/:numero) viendront après les
 * routes fixes, avec leurs écrans (M15-17, M15-18).
 */
export const BILLING_ROUTES: Routes = [
  {
    path: '',
    data: { contentWidth: 'full' },
    children: [
      {
        path: 'nouvelle',
        component: NewInvoicePage,
        title: $localize`:Titre d'onglet de l'éditeur d'une nouvelle facture@@billing.pageTitle.new:Nouvelle facture · PsyMate`,
      },
      {
        path: '',
        component: BillingPage,
        children: [
          {
            path: '',
            pathMatch: 'full',
            component: InvoicesPage,
            data: { billingTab: 'invoices' satisfies BillingTab },
            title: $localize`:Titre d'onglet du module Facturation (liste des factures)@@billing.pageTitle.invoices:Facturation · PsyMate`,
          },
          {
            path: 'a-facturer',
            component: BillablePage,
            data: { billingTab: 'billable' satisfies BillingTab },
            title: $localize`:Titre d'onglet de « À facturer » (module Facturation)@@billing.pageTitle.billable:À facturer · Facturation · PsyMate`,
          },
          {
            path: 'paiements',
            component: PaymentsPage,
            data: { billingTab: 'payments' satisfies BillingTab },
            title: $localize`:Titre d'onglet des paiements (module Facturation)@@billing.pageTitle.payments:Paiements · Facturation · PsyMate`,
          },
          {
            path: 'reglages',
            component: BillingSettingsPage,
            data: { billingTab: 'settings' satisfies BillingTab },
            title: $localize`:Titre d'onglet des réglages de facturation@@billing.pageTitle.settings:Réglages · Facturation · PsyMate`,
          },
        ],
      },
    ],
  },
];
