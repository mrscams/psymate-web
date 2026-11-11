import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TimelineMode } from '../data/timeline-filters.model';
import { modeLabel } from './timeline-labels';

let nextId = 0;

/**
 * Bascule Chronologique | Par séance de la timeline (fiche 03 ; touche M dans la page) : groupe
 * segmenté de deux boutons `aria-pressed`, le mode actif sur le fond primaire teinté. En vue
 * décennie (état C, purement chronologique), « Par séance » est inactif (fiche 03, écarts) :
 * `aria-disabled`, toujours atteignable, son aide est lue (`aria-describedby`) et un clic le signale
 * (`blocked`, la page prévient).
 */
@Component({
  selector: 'pm-timeline-mode',
  template: `
    <div
      class="mode"
      role="group"
      aria-label="Mode d'affichage (M)"
      i18n-aria-label="Nom du groupe de la bascule de mode de la timeline@@timeline.modeGroup"
    >
      @for (option of modes; track option) {
        <button
          type="button"
          aria-keyshortcuts="M"
          [attr.aria-pressed]="mode() === option"
          [attr.data-mode]="option"
          [attr.aria-disabled]="option === 'session' && sessionDisabled() ? 'true' : null"
          [attr.aria-describedby]="option === 'session' && sessionDisabled() ? hintId : null"
          (click)="choose(option)"
        >
          {{ label(option) }}
        </button>
      }
    </div>
    <span class="sr-only" [id]="hintId">{{ decadeHint }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .mode {
      display: inline-flex;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    // Bouton non sélectionné en text-secondary (UX-B2 : 6,2:1 ; l'ancien text-disabled faisait
    // 3,06:1). « Par séance » inactif en vue décennie garde ce contraste : l'état est porté par
    // aria-disabled et le curseur, pas par une couleur illisible.
    button {
      min-height: 26px;
      padding: 0 12px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
      cursor: pointer;

      & + button {
        border-left: 1px solid var(--border-subtle);
      }

      &[aria-disabled='true'] {
        background: var(--surface-sunken);
        cursor: not-allowed;
      }

      &[aria-pressed='true'] {
        background: var(--primary-tint);
        color: var(--primary-hover);
        font-weight: 600;
      }

      &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineModeComponent {
  readonly mode = input.required<TimelineMode>();
  /** Vue décennie affichée : « Par séance » attend le retour au détail (zoom avant). */
  readonly sessionDisabled = input(false);
  readonly modeChange = output<TimelineMode>();
  /** Clic sur « Par séance » inactif. */
  readonly blocked = output<void>();

  protected readonly hintId = `pm-timeline-mode-hint-${nextId++}`;

  protected readonly decadeHint = $localize`:Aide du bouton Par séance désactivé en vue décennie@@timeline.mode.decadeHint:Revenez au détail (zoom avant, +) pour regrouper par séance`;

  protected readonly modes: readonly TimelineMode[] = ['chronological', 'session'];

  protected choose(option: TimelineMode): void {
    if (option === 'session' && this.sessionDisabled()) {
      this.blocked.emit();
      return;
    }
    if (option !== this.mode()) this.modeChange.emit(option);
  }

  protected label(mode: TimelineMode): string {
    return modeLabel(mode);
  }
}
