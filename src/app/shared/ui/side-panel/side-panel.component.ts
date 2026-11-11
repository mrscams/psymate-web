import { DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

import { uniqueId } from '../../util';

/**
 * Cadre d'un panneau latéral (fiche 00 §6) : en-tête avec le titre et la croix, corps défilant,
 * pied fixe pour l'action principale et les raccourcis (`<kbd>`). Posé par le composant que
 * SidePanelService ouvre ; il relie `aria-labelledby` du dialogue à son titre et ferme le dialogue
 * sur la croix. Emplacements : contenu par défaut = corps ; `[pmPanelHeader]` à droite du titre ;
 * `[pmPanelFooter]` dans le pied. `subtitle` (UX-A8, maquettes 05 et 06 : « Marie D. · le lien est
 * visible dans le graphe et la timeline ») : une ligne secondaire sous le titre, reliée au dialogue
 * par `aria-describedby` ; sans elle, l'en-tête est rendu comme avant.
 */
@Component({
  selector: 'pm-side-panel',
  template: `
    <header class="panel-header">
      @if (subtitle(); as text) {
        <div class="heading">
          <h2 class="title" [id]="titleId">{{ title() }}</h2>
          <p class="subtitle" [id]="subtitleId">{{ text }}</p>
        </div>
      } @else {
        <h2 class="title" [id]="titleId">{{ title() }}</h2>
      }
      <ng-content select="[pmPanelHeader]" />
    </header>
    <div class="panel-body">
      <ng-content />
    </div>
    <footer class="panel-footer">
      <ng-content select="[pmPanelFooter]" />
    </footer>
    <!-- Dernier dans l'ordre de tabulation (le focus initial va au premier champ du corps), affiché en haut à droite. -->
    <button type="button" class="close" [attr.aria-label]="closeLabel" (click)="requestClose()">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  `,
  styleUrl: './side-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelComponent {
  readonly title = input.required<string>();
  /** Ligne secondaire sous le titre (patient, portée de l'action) ; null ou vide : aucune. */
  readonly subtitle = input<string | null>(null);
  /** Émis à la croix ; le dialogue est fermé dans tous les cas (le store garde le brouillon). */
  readonly closeRequested = output<void>();

  private readonly dialogRef = inject(DialogRef, { optional: true });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly titleId = uniqueId('pm-side-panel-title');
  protected readonly subtitleId = uniqueId('pm-side-panel-subtitle');
  protected readonly closeLabel = $localize`:Croix de fermeture d'un panneau@@sidePanel.close:Fermer le panneau`;

  constructor() {
    afterNextRender(() => {
      const dialog = this.element.nativeElement.closest('[role="dialog"]');
      if (dialog && !dialog.hasAttribute('aria-label')) {
        dialog.setAttribute('aria-labelledby', this.titleId);
      }
    });
    // Le sous-titre décrit le dialogue ; une description posée par le contenu est laissée telle quelle.
    afterRenderEffect(() => {
      const described = Boolean(this.subtitle());
      const dialog = this.element.nativeElement.closest('[role="dialog"]');
      if (!dialog) return;
      const current = dialog.getAttribute('aria-describedby');
      if (described && !current) dialog.setAttribute('aria-describedby', this.subtitleId);
      if (!described && current === this.subtitleId) dialog.removeAttribute('aria-describedby');
    });
  }

  protected requestClose(): void {
    this.closeRequested.emit();
    this.dialogRef?.close();
  }
}
