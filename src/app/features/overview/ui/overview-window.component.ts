import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { uniqueId } from '../../../shared/util';
import { OVERVIEW_WINDOWS, OverviewWindow } from '../data/overview.model';
import { saveFailedMessage, windowLabel } from './overview-labels';

/**
 * Sélecteur « Fenêtre : 30 j · 90 j · 1 an » (UX-S6, proposition 02 `.seg`) : posé par le shell
 * dans l'emplacement `[pmViewToggle]` de l'en-tête patient, à droite des onglets, sur l'onglet Vue
 * d'ensemble seulement ; il remplace la bascule Simple / Complète. Boutons à bascule
 * (`aria-pressed`). Écrit tout de suite la préférence overview.window (par praticien, tous patients,
 * tous appareils) ; la page de l'onglet relit la synthèse pour cette fenêtre. En erreur, le store a
 * rétabli la valeur serveur et un toast le dit.
 */
@Component({
  selector: 'pm-overview-window',
  template: `
    <span class="label" [id]="labelId" i18n="Libellé du sélecteur de fenêtre@@overview.window.label"
      >Fenêtre</span
    >
    <span class="seg" role="group" [attr.aria-labelledby]="labelId">
      @for (option of windows; track option) {
        <button
          type="button"
          [attr.aria-pressed]="prefs.overviewWindow() === option"
          (click)="choose(option)"
        >
          {{ label(option) }}
        </button>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .label {
      font-size: 13px;
      color: var(--text-secondary);
    }
    .seg {
      display: inline-flex;
      flex: none;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--surface-raised);
    }
    button {
      height: 28px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover {
      color: var(--text-primary);
    }
    button[aria-pressed='true'] {
      background: var(--primary-tint);
      color: var(--info);
      font-weight: 600;
    }
    button:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewWindowComponent {
  protected readonly prefs = inject(PreferencesStore);
  private readonly toasts = inject(ToastService);

  protected readonly labelId = uniqueId('overview-window');
  protected readonly windows = OVERVIEW_WINDOWS;
  protected readonly label = windowLabel;

  protected async choose(window: OverviewWindow): Promise<void> {
    if (this.prefs.overviewWindow() === window) return;
    const problem = await this.prefs.set('overview.window', window);
    if (problem) this.toasts.warning(saveFailedMessage(problem));
  }
}
