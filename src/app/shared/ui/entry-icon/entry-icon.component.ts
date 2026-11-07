import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Les six types d'entrée du contrat (EntryDto.type). */
export type EntryType = 'note' | 'event' | 'situation' | 'feeling' | 'session' | 'medication';

export const ENTRY_TYPES: readonly EntryType[] = [
  'note',
  'event',
  'situation',
  'feeling',
  'session',
  'medication',
];

export function entryTypeLabel(type: EntryType): string {
  switch (type) {
    case 'note':
      return $localize`:Type d'entrée@@entry.type.note:Note`;
    case 'event':
      return $localize`:Type d'entrée@@entry.type.event:Événement`;
    case 'situation':
      return $localize`:Type d'entrée@@entry.type.situation:Situation`;
    case 'feeling':
      return $localize`:Type d'entrée@@entry.type.feeling:Ressenti`;
    case 'session':
      return $localize`:Type d'entrée@@entry.type.session:Séance`;
    case 'medication':
      return $localize`:Type d'entrée@@entry.type.medication:Médicament`;
  }
}

/**
 * Icône d'un type d'entrée (fiche 00 « Tokens », étude couleurs §4) : une forme et une couleur par
 * type, pour que la forme seule suffise en noir et blanc. Note rectangle, événement losange,
 * situation barre, ressenti cercle, séance carré arrondi, médicament capsule. Décorative par défaut
 * (`aria-hidden`) ; avec `labelled`, elle porte le nom du type pour les lecteurs d'écran.
 */
@Component({
  selector: 'pm-entry-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 16 16"
      [class]="'type-' + type()"
      [attr.role]="labelled() ? 'img' : null"
      [attr.aria-label]="labelled() ? label : null"
      [attr.aria-hidden]="labelled() ? null : 'true'"
      focusable="false"
    >
      @switch (type()) {
        @case ('note') {
          <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
        }
        @case ('event') {
          <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />
        }
        @case ('situation') {
          <rect x="1.5" y="6" width="13" height="4" rx="2" />
        }
        @case ('feeling') {
          <circle cx="8" cy="8" r="6.5" />
        }
        @case ('session') {
          <rect class="frame" x="2.5" y="2.5" width="11" height="11" rx="3" />
        }
        @case ('medication') {
          <rect x="1.5" y="5" width="13" height="6" rx="3" />
          <path class="divider" d="M8 5v6" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
      line-height: 0;
    }
    svg {
      fill: currentColor;
    }
    .type-note {
      color: var(--entry-note);
    }
    .type-event {
      color: var(--entry-event);
    }
    .type-situation {
      color: var(--entry-situation);
    }
    .type-feeling {
      color: var(--entry-feeling);
    }
    .type-session {
      color: var(--entry-session);
    }
    .type-medication {
      color: var(--entry-medication);
    }
    .frame {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }
    .divider {
      stroke: var(--surface-raised);
      stroke-width: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryIconComponent {
  readonly type = input.required<EntryType>();
  readonly size = input(16);
  /** Nommer l'icône (seule, sans texte à côté) au lieu de la cacher aux lecteurs d'écran. */
  readonly labelled = input(false);

  protected get label(): string {
    return entryTypeLabel(this.type());
  }
}
