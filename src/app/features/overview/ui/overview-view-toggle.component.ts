import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { OverviewMode } from '../data/overview.model';
import { saveFailedMessage } from './overview-labels';

/**
 * Bascule « Vue : Simple · Complète » (B8, fiche 00 §2, fiche 02) : posée par le shell dans
 * l'emplacement `[pmViewToggle]` de l'en-tête patient, à droite des onglets, visible sur l'onglet 1
 * seulement. Écrit tout de suite la préférence overview.view (par praticien, tous patients, tous
 * appareils), sans bouton « enregistrer » ; en erreur, le store a rétabli la valeur serveur et un
 * toast le dit.
 */
@Component({
  selector: 'pm-overview-view-toggle',
  template: `
    <div
      class="toggle"
      role="group"
      aria-label="Niveau de détail de la vue d'ensemble"
      i18n-aria-label="Groupe de la bascule de vue@@overview.view.group"
      aria-describedby="overview-view-hint"
    >
      <span
        class="label"
        aria-hidden="true"
        i18n="Libellé de la bascule de vue@@overview.view.label"
        >Vue</span
      >
      <span class="buttons">
        <button
          type="button"
          [attr.aria-pressed]="prefs.overviewView() === 'simple'"
          (click)="choose('simple')"
          i18n="Bascule de vue : récit@@overview.view.simple"
        >
          Simple
        </button>
        <button
          type="button"
          [attr.aria-pressed]="prefs.overviewView() === 'complete'"
          (click)="choose('complete')"
          i18n="Bascule de vue : chiffres@@overview.view.complete"
        >
          Complète
        </button>
      </span>
      <span id="overview-view-hint" class="hint" i18n="Sous la bascule de vue@@overview.view.hint"
        >mémorisée dans vos préférences</span
      >
    </div>
  `,
  styles: `
    /* Fenêtre étroite (zoom 200 %, M7-04) : l'indication passe sous les boutons au lieu de les
       comprimer ; le groupe de boutons ne rétrécit jamais (overflow: hidden lui permettait de
       descendre à 0 et rognait « Complète »). */
    .toggle {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 4px 8px;
      font: var(--mat-sys-label-medium);
      color: var(--text-secondary);
    }
    .buttons {
      display: inline-flex;
      flex: none;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    button {
      min-height: 28px;
      padding: 0 12px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font: inherit;
      font-weight: 500;
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
    .hint {
      font-size: 11px;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewViewToggleComponent {
  protected readonly prefs = inject(PreferencesStore);
  private readonly toasts = inject(ToastService);

  protected async choose(mode: OverviewMode): Promise<void> {
    if (this.prefs.overviewView() === mode) return;
    const problem = await this.prefs.set('overview.view', mode);
    if (problem) this.toasts.warning(saveFailedMessage(problem));
  }
}
