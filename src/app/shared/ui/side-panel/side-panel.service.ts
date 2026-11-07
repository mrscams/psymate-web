import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';

/** 480 px par défaut ; 420 px pour l'éditeur de lien (fiche 00 §6). */
export type SidePanelWidth = 480 | 420;

export interface SidePanelOptions<D = unknown> {
  data?: D;
  width?: SidePanelWidth;
  /** Nom du panneau pour les lecteurs d'écran si le contenu ne pose pas pm-side-panel (aria-labelledby). */
  ariaLabel?: string;
  /**
   * S'ouvrir par-dessus le panneau courant (l'éditeur de lien sur l'éditeur d'entrée) : pile de
   * deux au plus. Sans cette option, le panneau courant est fermé d'abord (un seul à la fois).
   */
  stack?: boolean;
}

/** Au plus deux panneaux empilés (fiche 00 §6). */
export const SIDE_PANEL_MAX_DEPTH = 2;

/** Poignée d'un panneau ouvert : fermer avec un résultat, attendre la fermeture. */
export class SidePanelRef<R = unknown> {
  /** Résultat passé à close(), undefined si fermé par Échap, le voile ou la croix. */
  readonly closed: Promise<R | undefined>;

  constructor(private readonly dialogRef: DialogRef<R, unknown>) {
    this.closed = firstValueFrom(dialogRef.closed, { defaultValue: undefined });
  }

  close(result?: R): void {
    this.dialogRef.close(result);
  }

  afterClosed(): Observable<R | undefined> {
    return this.dialogRef.closed;
  }
}

/**
 * Panneau latéral (fiche 00 §6, B2) sur le Dialog du CDK : `role="dialog"`, `aria-modal`, ancré à
 * droite sur toute la hauteur, page visible derrière un voile, piège de focus, retour du focus à
 * l'élément déclencheur, `Échap` et clic sur le voile ferment (le brouillon reste au store de la
 * feature), le reste de la page passe en `aria-hidden`. Le contenu est un composant de la feature,
 * qui pose `<pm-side-panel title>` pour l'en-tête, le corps et le pied.
 */
@Injectable({ providedIn: 'root' })
export class SidePanelService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private readonly shortcuts = inject(ShortcutService);
  private readonly stack = signal<DialogRef<unknown>[]>([]);
  private releaseEscape: (() => void) | null = null;

  /** Nombre de panneaux ouverts (0, 1 ou 2). */
  readonly depth = computed(() => this.stack().length);
  readonly isOpen = computed(() => this.stack().length > 0);

  /**
   * Ouvre `component` dans un panneau. Renvoie null quand la pile est pleine (deux panneaux déjà
   * ouverts et `stack` demandé).
   */
  open<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    options: SidePanelOptions<D> = {},
  ): SidePanelRef<R> | null {
    if (options.stack) {
      if (this.depth() >= SIDE_PANEL_MAX_DEPTH) return null;
    } else {
      this.closeAll();
    }
    const width = options.width ?? 480;
    const ref = this.dialog.open<R, D, T>(component, {
      data: options.data,
      width: `${width}px`,
      maxWidth: '100vw',
      height: '100%',
      positionStrategy: this.overlay.position().global().right('0').top('0'),
      panelClass: ['pm-side-panel-pane', `pm-side-panel-pane--${width}`],
      backdropClass: 'pm-side-panel-veil',
      hasBackdrop: true,
      disableClose: false,
      restoreFocus: true,
      autoFocus: 'first-tabbable',
      role: 'dialog',
      ariaModal: true,
      ariaLabel: options.ariaLabel ?? null,
      closeOnNavigation: true,
    });
    this.stack.update((list) => [...list, ref as DialogRef<unknown>]);
    this.holdEscape();
    ref.closed.subscribe(() => {
      this.stack.update((list) => list.filter((item) => item !== ref));
      if (this.depth() === 0) this.holdEscape(false);
    });
    return new SidePanelRef<R>(ref as DialogRef<R, unknown>);
  }

  /** Ferme le panneau du dessus (celui qui a le focus). */
  closeTop(): void {
    this.stack().at(-1)?.close();
  }

  closeAll(): void {
    for (const ref of [...this.stack()].reverse()) ref.close();
  }

  /**
   * Tant qu'un panneau est ouvert, Échap lui appartient : le CDK ferme le panneau du dessus et
   * marque l'événement traité ; cette inscription vide masque les autres inscriptions d'Échap.
   */
  private holdEscape(hold = true): void {
    if (hold && !this.releaseEscape) {
      this.releaseEscape = this.shortcuts.register('Escape', () => this.closeTop());
    } else if (!hold && this.releaseEscape) {
      this.releaseEscape();
      this.releaseEscape = null;
    }
  }
}
