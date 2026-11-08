import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';

/**
 * Barre de capture rapide repliée (fiche 00 §2, B5) : le champ « Noter quelque chose… » posé dans
 * l'emplacement [pmCapture] de l'en-tête patient. Entrée émet le texte saisi (`capture`) : M1-08 y
 * branche l'éditeur d'entrée, M6-02 la grammaire et l'aperçu. Tant que le champ a le focus, les
 * touches 1 2 3 écrivent au lieu de changer d'onglet (core/shortcuts).
 */
@Component({
  selector: 'pm-capture-bar',
  template: `
    <label
      class="sr-only"
      for="pm-capture-input"
      i18n="Étiquette de la barre de capture@@patientShell.capture.label"
      >Noter quelque chose</label
    >
    <input
      id="pm-capture-input"
      class="field"
      type="text"
      autocomplete="off"
      placeholder="Noter quelque chose…"
      i18n-placeholder="Texte indicatif de la barre de capture@@patientShell.capture.placeholder"
      [value]="text()"
      (input)="text.set($any($event.target).value)"
      (keydown.enter)="submit($event)"
    />
  `,
  styles: `
    :host {
      display: block;
    }
    .field {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 10px 14px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-large);
    }
    .field::placeholder {
      color: var(--text-secondary);
      opacity: 1;
    }
    .field:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureBarComponent {
  /** Entrée dans le champ : le texte saisi (peut être vide), pour l'éditeur d'entrée (M1-08). */
  readonly capture = output<string>();

  protected readonly text = signal('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Donne le focus au champ après le prochain rendu (l'en-tête vient de changer). */
  focus(): void {
    afterNextRender(() => this.host.nativeElement.querySelector('input')?.focus(), {
      injector: this.injector,
    });
  }

  /** Vide le champ (son texte est passé dans le brouillon de l'éditeur d'entrée). */
  clear(): void {
    this.text.set('');
    // Le champ peut avoir été rempli sans rendu intermédiaire : on vide aussi sa valeur DOM.
    const input = this.host.nativeElement.querySelector('input');
    if (input) input.value = '';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.capture.emit(this.text().trim());
  }
}
