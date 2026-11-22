import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BookingBarLevel = 'info' | 'warning' | 'danger';

/**
 * Encart des pages de prise de rendez-vous (maquette 31, « bar ») : le niveau est porté par le fond,
 * l'icône et le texte, jamais par la couleur seule. Phrase du mode (info, `role="note"`), créneau
 * plus disponible et plafond (warning, `role="alert"`), échec d'envoi (danger, `role="alert"`). Le
 * texte est projeté. Le bandeau global (pm-status-banner) est celui de l'application, pas celui-ci.
 */
@Component({
  selector: 'pm-booking-bar',
  template: `
    <div class="bar" [class]="level()" [attr.role]="role()">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        @if (level() === 'info') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" />
        } @else {
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v5M12 17.5v.5" />
        }
      </svg>
      <p><ng-content /></p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .bar {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-primary);

      &.info {
        background: var(--info-bg);
        --bar-icon: var(--info);
      }

      &.warning {
        background: var(--warning-bg);
        --bar-icon: var(--warning);
      }

      &.danger {
        background: var(--danger-bg);
        --bar-icon: var(--danger);
      }
    }

    .icon {
      flex: none;
      width: 20px;
      height: 20px;
      fill: none;
      stroke: var(--bar-icon);
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    p {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingBarComponent {
  readonly level = input<BookingBarLevel>('info');
  readonly role = input<'note' | 'alert'>('note');
}
