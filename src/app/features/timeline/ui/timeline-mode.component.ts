import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TimelineMode } from '../data/timeline-filters.model';
import { modeLabel } from './timeline-labels';

/**
 * Bascule Chronologique | Par séance de la timeline (fiche 03 ; touche M dans la page) : groupe
 * segmenté de deux boutons `aria-pressed`, le mode actif sur le fond primaire teinté. En vue
 * décennie (état C, purement chronologique), « Par séance » est désactivé (fiche 03, écarts).
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
          [disabled]="option === 'session' && sessionDisabled()"
          [attr.title]="option === 'session' && sessionDisabled() ? decadeHint : null"
          (click)="choose(option)"
        >
          {{ label(option) }}
        </button>
      }
    </div>
  `,
  styles: `
    .mode {
      display: inline-flex;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      overflow: hidden;
    }

    button {
      min-height: 36px;
      padding: 0 14px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;

      & + button {
        border-left: 1px solid var(--border-strong);
      }

      &:disabled {
        color: var(--text-disabled);
        cursor: default;
      }

      &[aria-pressed='true'] {
        background: var(--primary-tint);
        color: var(--primary-hover);
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

  protected readonly decadeHint = $localize`:Aide du bouton Par séance désactivé en vue décennie@@timeline.mode.decadeHint:Revenez au détail (zoom avant, +) pour regrouper par séance`;

  protected readonly modes: readonly TimelineMode[] = ['chronological', 'session'];

  protected choose(option: TimelineMode): void {
    if (option === 'session' && this.sessionDisabled()) return;
    if (option !== this.mode()) this.modeChange.emit(option);
  }

  protected label(mode: TimelineMode): string {
    return modeLabel(mode);
  }
}
