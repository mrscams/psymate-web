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
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--surface-raised);
    }

    // Groupe segmenté (proposition 03, .seg) : bordure subtle, rayon 8, 2 px de marge intérieure ;
    // boutons de 28 px, rayon 6, 13 px secondaire ; actif sur primary-tint, texte primary, 600.
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
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        color: var(--text-primary);
      }

      &[aria-disabled='true'] {
        background: var(--surface-sunken);
        cursor: not-allowed;
      }

      &[aria-pressed='true'] {
        background: var(--primary-tint);
        color: var(--primary);
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
