import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import {
  BillingHeaderComponent,
  BillingTab,
  NEW_INVOICE_URL,
} from '../ui/billing-header.component';

/**
 * Cadre du module Facturation (fiche 33) : l'en-tête de module (titre, « Nouvelle facture », quatre
 * onglets) au-dessus de la page de l'onglet courant. La touche N ouvre l'éditeur, comme le bouton,
 * sauf sur Réglages où le bouton n'existe pas. L'onglet courant est lu dans `data.billingTab` de la
 * route enfant. Socle M15-14 : aucun appel d'API (le compteur de « À facturer » viendra du serveur
 * avec les écrans suivants).
 */
@Component({
  selector: 'pm-billing-page',
  imports: [BillingHeaderComponent, RouterOutlet],
  templateUrl: './billing.page.html',
  styleUrl: './billing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillingPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tab = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.currentTab()),
    ),
    { initialValue: this.currentTab() },
  );
  protected readonly showCreate = computed(() => this.tab() !== 'settings');

  private readonly newLabel = $localize`:Aide des raccourcis (module Facturation)@@billing.shortcut.new:Nouvelle facture`;

  constructor() {
    const shortcuts = inject(ShortcutService);
    effect((onCleanup) => {
      if (!this.showCreate()) return;
      const release = shortcuts.register(
        'n',
        () => void this.router.navigateByUrl(NEW_INVOICE_URL),
        this.newLabel,
      );
      onCleanup(release);
    });
  }

  private currentTab(): BillingTab | null {
    let child = this.route.snapshot.firstChild;
    while (child?.firstChild) child = child.firstChild;
    return (child?.data['billingTab'] as BillingTab | undefined) ?? null;
  }
}
