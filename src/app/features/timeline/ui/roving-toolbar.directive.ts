import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** Contrôles atteignables de la barre (les désactivés sont sautés). */
const CONTROLS = 'button:not([disabled])';

/**
 * Barre d'outils au clavier (motif ARIA « toolbar », fiche 03 et revue M3-02) : un seul arrêt de
 * tabulation, celui du dernier contrôle utilisé ; `←` `→` passent au contrôle voisin (en boucle),
 * `Début` `Fin` au premier et au dernier. Les contrôles qui apparaissent, disparaissent ou changent
 * d'état (puces venues des facettes, zoom désactivé) sont repris par un MutationObserver limité à
 * la barre.
 */
@Directive({
  selector: '[pmRovingToolbar]',
  host: {
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusin($event)',
  },
})
export class RovingToolbarDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private active: HTMLElement | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.normalize();
      if (typeof MutationObserver === 'undefined') return;
      // tabindex n'est pas observé : la normalisation ne se relance pas elle-même.
      const observer = new MutationObserver(() => this.normalize());
      observer.observe(this.host.nativeElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled'],
      });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Donne le focus à l'arrêt courant de la barre (touche F de la timeline). */
  focus(): void {
    this.normalize();
    this.active?.focus();
  }

  protected onFocusin(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && this.controls().includes(target)) {
      this.active = target;
      this.normalize();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const controls = this.controls();
    const index = controls.indexOf(event.target as HTMLElement);
    if (index < 0 || !controls.length) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % controls.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + controls.length) % controls.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = controls.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.active = controls[next];
    this.normalize();
    controls[next].focus();
  }

  private controls(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>(CONTROLS)];
  }

  /** Un seul contrôle à tabindex 0 : l'actif s'il est toujours là, sinon le premier. */
  private normalize(): void {
    const controls = this.controls();
    if (!this.active || !controls.includes(this.active)) this.active = controls[0] ?? null;
    for (const control of controls) {
      const wanted = control === this.active ? 0 : -1;
      if (control.tabIndex !== wanted) control.tabIndex = wanted;
    }
  }
}
