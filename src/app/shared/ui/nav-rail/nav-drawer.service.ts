import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { inject, Injectable, signal } from '@angular/core';

import { ShortcutService } from '../../../core/shortcuts';
import { NAV_DRAWER_WIDTH, NavRailComponent } from './nav-rail.component';

/**
 * Tiroir de navigation (UX-S8, sous 900 px) : le rail, libellés d'emblée, dans un dialogue du CDK
 * ancré à gauche sur toute la hauteur, par-dessus la page et la barre, derrière un voile léger. Même
 * patron que le panneau latéral (fiche 00 §6) : `role="dialog"`, `aria-modal`, piège de focus,
 * retour du focus au déclencheur (le bouton ☰), `Échap`, clic sur le voile et la croix ferment.
 */
@Injectable({ providedIn: 'root' })
export class NavDrawerService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private readonly shortcuts = inject(ShortcutService);
  private ref: DialogRef<unknown, NavRailComponent> | null = null;

  /** Le tiroir est ouvert (aria-expanded du bouton ☰). */
  readonly isOpen = signal(false);

  open(): void {
    if (this.ref) return;
    const ref = this.dialog.open<unknown, unknown, NavRailComponent>(NavRailComponent, {
      width: `${NAV_DRAWER_WIDTH}px`,
      maxWidth: '100vw',
      height: '100%',
      positionStrategy: this.overlay.position().global().left('0').top('0'),
      panelClass: 'pm-nav-drawer-pane',
      backdropClass: 'pm-nav-drawer-veil',
      hasBackdrop: true,
      disableClose: false,
      restoreFocus: true,
      autoFocus: 'a.item',
      role: 'dialog',
      ariaModal: true,
      ariaLabel: $localize`:Nom de la navigation principale (rail, tiroir)@@navRail.label:Navigation`,
      closeOnNavigation: true,
    });
    this.ref = ref;
    this.isOpen.set(true);
    // Tant que le tiroir est ouvert, Échap lui appartient (le CDK le ferme) : cette inscription
    // vide masque les autres inscriptions d'Échap de la page.
    const releaseEscape = this.shortcuts.register('Escape', () => this.close());
    ref.closed.subscribe(() => {
      releaseEscape();
      if (this.ref === ref) {
        this.ref = null;
        this.isOpen.set(false);
      }
    });
  }

  close(): void {
    this.ref?.close();
  }

  /** ☰ ou Ctrl+B sous 900 px : ouvre, ou ferme si le tiroir est déjà ouvert. */
  toggle(): void {
    if (this.ref) this.close();
    else this.open();
  }
}
