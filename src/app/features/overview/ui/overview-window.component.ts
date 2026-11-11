import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { OVERVIEW_WINDOWS, OverviewWindow } from '../data/overview.model';
import { windowLabel } from './overview-labels';

/**
 * Sélecteur de fenêtre 30 j / 90 j / 1 an (préférence overview.window), dans la carte de la courbe
 * comme les maquettes 02 et 02b (UX-B4, UX-B5) : boutons à bascule (`aria-pressed`), Tab de l'un à
 * l'autre, Entrée et Espace les pressent. La page écrit la préférence ; la synthèse est relue.
 */
@Component({
  selector: 'pm-overview-window',
  template: `
    <div
      class="windows"
      role="group"
      aria-label="Période de la vue d'ensemble"
      i18n-aria-label="Groupe du sélecteur de fenêtre@@overview.window.group"
    >
      @for (option of windows; track option) {
        <button
          type="button"
          [attr.aria-pressed]="value() === option"
          (click)="selected.emit(option)"
        >
          {{ label(option) }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .windows {
      display: inline-flex;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    button {
      min-width: 44px;
      min-height: 28px;
      padding: 0 10px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
      cursor: pointer;
    }
    button + button {
      border-left: 1px solid var(--border-subtle);
    }
    button[aria-pressed='true'] {
      background: var(--primary-tint);
      color: var(--info);
      font-weight: 600;
    }
    button:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewWindowComponent {
  /** Fenêtre choisie (préférence). */
  readonly value = input.required<OverviewWindow>();
  readonly selected = output<OverviewWindow>();

  protected readonly windows = OVERVIEW_WINDOWS;
  protected readonly label = windowLabel;
}
