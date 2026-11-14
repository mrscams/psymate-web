import { DialogRef } from '@angular/cdk/dialog';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { ShortcutService } from '../../../core/shortcuts';

/** Icônes des carreaux : SVG en trait, `currentColor` (proposition 05, section A). */
export type NavRailIcon = 'patients' | 'agenda' | 'invoice';

/** Un carreau du rail : une fonctionnalité de l'application. */
export interface NavRailEntry {
  key: string;
  label: string;
  icon: NavRailIcon;
  /** Route du carreau, active sur elle et ses sous-routes ; null : « à réaliser », sans lien. */
  route: string | null;
}

/** Largeurs du rail (UX-S8) : replié, déplié par-dessus la page, tiroir sous 900 px. */
export const NAV_RAIL_WIDTH = 56;
export const NAV_RAIL_EXPANDED_WIDTH = 220;
export const NAV_DRAWER_WIDTH = 280;
/** Sous cette largeur de fenêtre, le rail disparaît : le bouton ☰ de la barre ouvre le tiroir. */
export const NAV_RAIL_MIN_VIEWPORT = 900;

/** Touche du rail (core/shortcuts) : Ctrl+B, ⌘+B sur Mac. */
export const NAV_RAIL_SHORTCUT = 'ctrl+b';

/**
 * Les carreaux, dans l'ordre (décision du 14 novembre 2026) : Patients, puis Agenda (hors V1, G Q25)
 * et Facture, « à réaliser », sans route. Rien d'autre : ni séances, ni patients récents, ni Mon compte.
 */
export function navRailEntries(): readonly NavRailEntry[] {
  return [
    {
      key: 'patients',
      label: $localize`:Carreau Patients du rail de navigation@@navRail.patients:Patients`,
      icon: 'patients',
      route: '/patients',
    },
    {
      key: 'agenda',
      label: $localize`:Carreau Agenda du rail de navigation, à réaliser@@navRail.agenda:Agenda`,
      icon: 'agenda',
      route: null,
    },
    {
      key: 'invoice',
      label: $localize`:Carreau Facture du rail de navigation, à réaliser@@navRail.invoice:Facture`,
      icon: 'invoice',
      route: null,
    },
  ];
}

/**
 * Rail de navigation du praticien (fiche 00 §9, UX-S8, proposition 05 A) : une colonne de 56 px
 * sous la barre d'application, trois carreaux de 44 px. Au survol ou au focus clavier, il passe à
 * 220 px par-dessus la page (la coquille le positionne ; il ne rétrécit jamais la page) et montre
 * les libellés ; il se replie quand le pointeur ou le focus en sort. `Échap` le replie et rend le
 * focus à l'élément d'où il venait ; `Ctrl+B` porte le focus sur le carreau actif (ou le replie s'il
 * l'a déjà) ; quand le rail est masqué (sous 900 px), `Ctrl+B` émet `drawerRequested`.
 *
 * Le même composant sert de tiroir (280 px, libellés d'emblée, ✕) quand NavDrawerService l'ouvre
 * dans un dialogue du CDK : il le sait par la présence d'un `DialogRef`.
 */
@Component({
  selector: 'pm-nav-rail',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './nav-rail.component.html',
  styleUrl: './nav-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Écouteurs sur l'hôte : le rail déplié est son descendant, survol et focus le suivent.
  host: {
    '[class.in-drawer]': 'drawer',
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'onPointerLeave()',
    '(pointerdown)': 'onPointerDown()',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class NavRailComponent {
  /** Rail masqué (sous 900 px) et Ctrl+B pressé : la coquille ouvre ou ferme le tiroir. */
  readonly drawerRequested = output<void>();

  private readonly dialogRef = inject(DialogRef, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** Dans un tiroir (dialogue du CDK) : libellés visibles, en-tête avec la croix. */
  protected readonly drawer = this.dialogRef !== null;
  protected readonly entries = navRailEntries();
  protected readonly navLabel = $localize`:Nom de la navigation principale (rail, tiroir)@@navRail.label:Navigation`;
  protected readonly closeLabel = $localize`:Bouton qui ferme le tiroir de navigation@@navRail.close:Fermer la navigation`;
  protected readonly later = $localize`:Fonctionnalité pas encore disponible, à côté de son nom@@navRail.later:à réaliser`;

  private readonly hovered = signal(false);
  private readonly focused = signal(false);
  /** Échap : replié même sous le pointeur, jusqu'à ce qu'il sorte ou que le focus revienne. */
  private readonly dismissed = signal(false);
  /** Déplié : libellés visibles, 220 px par-dessus la page. */
  readonly expanded = computed(
    () => this.drawer || (!this.dismissed() && (this.hovered() || this.focused())),
  );
  /** Élément qui avait le focus avant le rail : Échap le lui rend. */
  private returnTo: HTMLElement | null = null;
  /** Un clic dans le rail est en cours : le focus qu'il donne ne déplie pas le rail. */
  private pointerFocus = false;

  constructor() {
    if (this.drawer) return;
    const release = inject(ShortcutService).register(NAV_RAIL_SHORTCUT, () => this.toggle());
    inject(DestroyRef).onDestroy(release);
  }

  /** Nom accessible et infobulle d'un carreau à réaliser : « Agenda, à réaliser ». */
  protected laterName(entry: NavRailEntry): string {
    return `${entry.label}, ${this.later}`;
  }

  /**
   * Ctrl+B : focus sur le carreau actif (le premier carreau lié sinon), ce qui déplie le rail ; s'il
   * a déjà le focus, le replie comme Échap. Rail masqué (sous 900 px) : demande le tiroir.
   */
  toggle(): void {
    if (getComputedStyle(this.host).display === 'none') {
      this.drawerRequested.emit();
      return;
    }
    if (this.host.contains(this.document.activeElement)) {
      this.collapse();
      return;
    }
    const target =
      this.host.querySelector<HTMLElement>('a.item.active') ??
      this.host.querySelector<HTMLElement>('a.item');
    if (!target) return;
    const active = this.document.activeElement;
    this.returnTo = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.dismissed.set(false);
    target.focus();
    this.focused.set(true);
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.hovered.set(true);
  }

  protected onPointerLeave(): void {
    this.hovered.set(false);
    this.dismissed.set(false);
  }

  protected onPointerDown(): void {
    this.pointerFocus = true;
    // Le focus suit le pointerdown dans la même tâche ; au-delà, l'indicateur ne vaut plus.
    setTimeout(() => (this.pointerFocus = false));
  }

  /**
   * Focus entrant : déplie au focus clavier ou programmatique (Tab, Ctrl+B, lecteur d'écran) ; un
   * clic sur Patients donne le focus au lien sans garder le rail ouvert une fois le pointeur sorti.
   */
  protected onFocusIn(event: FocusEvent): void {
    if (this.drawer) return;
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !this.host.contains(from)) this.returnTo = from;
    this.dismissed.set(false);
    this.focused.set(!this.pointerFocus);
  }

  protected onFocusOut(event: FocusEvent): void {
    if (this.drawer) return;
    const to = event.relatedTarget;
    if (to instanceof Node && this.host.contains(to)) return;
    this.focused.set(false);
  }

  /** Échap dans le rail : replie et rend le focus ; dans le tiroir, le dialogue s'en charge. */
  protected onEscape(event: Event): void {
    if (this.drawer) return;
    event.preventDefault();
    this.collapse();
  }

  /** Clic sur un carreau du tiroir : le tiroir se ferme (la navigation ne le ferme pas seule). */
  protected onNavigate(): void {
    this.dialogRef?.close();
  }

  protected close(): void {
    this.dialogRef?.close();
  }

  private collapse(): void {
    this.dismissed.set(true);
    this.focused.set(false);
    const target = this.returnTo;
    this.returnTo = null;
    if (target?.isConnected) {
      target.focus();
    } else {
      const active = this.document.activeElement;
      if (active instanceof HTMLElement && this.host.contains(active)) active.blur();
    }
  }
}
