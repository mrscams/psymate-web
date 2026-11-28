import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

/** Onglet de l'en-tête de module ; chaque page à onglet le déclare dans `data.billingTab`. */
export type BillingTab = 'invoices' | 'billable' | 'payments' | 'settings';

/** Route de l'éditeur d'une nouvelle facture (fiche 35) : bouton « Nouvelle facture » et touche N. */
export const NEW_INVOICE_URL = '/facturation/nouvelle';

/** Un onglet de l'en-tête de module (fiche 33, « Cadre du module »). */
export interface BillingTabLink {
  key: BillingTab;
  label: string;
  link: string;
  /** Au bout de la ligne, à droite (Réglages). */
  end: boolean;
  match: IsActiveMatchOptions;
}

/** La requête (?statut=, ?patient=…) ne change pas l'onglet courant. */
const IGNORED = { queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } as const;

/**
 * Les quatre onglets, dans l'ordre de la fiche 33 : Factures (actif sur /facturation seul, quelle
 * que soit la requête), À facturer, Paiements et, au bout de la ligne, Réglages.
 */
export function billingTabs(): readonly BillingTabLink[] {
  return [
    {
      key: 'invoices',
      label: $localize`:Onglet Factures du module Facturation@@billing.tab.invoices:Factures`,
      link: '/facturation',
      end: false,
      match: { paths: 'exact', ...IGNORED },
    },
    {
      key: 'billable',
      label: $localize`:Onglet À facturer du module Facturation@@billing.tab.billable:À facturer`,
      link: '/facturation/a-facturer',
      end: false,
      match: { paths: 'subset', ...IGNORED },
    },
    {
      key: 'payments',
      label: $localize`:Onglet Paiements du module Facturation@@billing.tab.payments:Paiements`,
      link: '/facturation/paiements',
      end: false,
      match: { paths: 'subset', ...IGNORED },
    },
    {
      key: 'settings',
      label: $localize`:Onglet Réglages du module Facturation@@billing.tab.settings:Réglages`,
      link: '/facturation/reglages',
      end: true,
      match: { paths: 'subset', ...IGNORED },
    },
  ];
}

/**
 * En-tête du module Facturation (fiche 33, maquette facturation/01, `.mhead`) : bande
 * `surface-raised` comme l'en-tête patient, titre « Facturation », bouton plein « Nouvelle facture »
 * (touche N, inscrite par la page) à droite, puis la ligne d'onglets, dessinés comme ceux de
 * l'en-tête patient. Sans « Nouvelle facture » sur Réglages (`showCreate`). Le compteur de
 * « À facturer » ne s'affiche que s'il est supérieur à zéro ; il vient du serveur (écrans suivants).
 * Sous 600 px : onglets sur toute la largeur, « Nouvelle facture » en barre du bas.
 */
@Component({
  selector: 'pm-billing-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './billing-header.component.html',
  styleUrl: './billing-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingHeaderComponent {
  /** « Nouvelle facture » affiché (pas sur Réglages). */
  readonly showCreate = input(true);
  /** Nombre de séances à facturer (serveur) ; null tant qu'il n'est pas connu. */
  readonly billableCount = input<number | null>(null);

  protected readonly tabs = billingTabs();
  protected readonly newInvoiceUrl = NEW_INVOICE_URL;
  protected readonly badge = computed(() => {
    const count = this.billableCount();
    return count !== null && count > 0 ? count : null;
  });
}
