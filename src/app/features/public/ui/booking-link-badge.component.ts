import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Pictogramme d'état (maquette 32) : horloge, coche, croix, calendrier, lien rompu, triangle. */
export type LinkIcon = 'clock' | 'check' | 'cross' | 'calendar' | 'link-off' | 'alert';

/**
 * Teinte du carré : succès (`ok`), attente et information (`wait`), lien invalide, créneau
 * indisponible, plafond (`warn`), annulé et passé (`muted`). Jamais rouge (fiche 32, Tokens).
 */
export type LinkTone = 'ok' | 'wait' | 'warn' | 'muted';

/** Carré de 48 px qui porte le pictogramme d'état des pages par lien, décoratif. */
@Component({
  selector: 'pm-booking-link-badge',
  template: `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      @switch (icon()) {
        @case ('clock') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        }
        @case ('check') {
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.5 3 3 5-6" />
        }
        @case ('cross') {
          <circle cx="12" cy="12" r="9" />
          <path d="m9 9 6 6M15 9l-6 6" />
        }
        @case ('calendar') {
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        }
        @case ('link-off') {
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          <path d="m4 4 16 16" />
        }
        @default {
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v5M12 17.5v.5" />
        }
      }
    </svg>
  `,
  host: { 'aria-hidden': 'true', '[class]': 'tone()' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 8px;
    }

    :host(.ok) {
      background: var(--success-bg);
      color: var(--success);
    }

    :host(.wait) {
      background: var(--info-bg);
      color: var(--info);
    }

    :host(.warn) {
      background: var(--warning-bg);
      color: var(--warning);
    }

    :host(.muted) {
      background: var(--surface-sunken);
      color: var(--text-secondary);
    }

    .icon {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingLinkBadgeComponent {
  readonly icon = input.required<LinkIcon>();
  readonly tone = input.required<LinkTone>();
}
