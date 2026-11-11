import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

export type BannerLevel = 'warning' | 'success' | 'info';

/**
 * Bandeau global sous la barre d'application (fiche 00 §1, planche 29) : avertissement, succès ou
 * information, non fermable tant que l'état dure, `role="status"`. Icône + mot du niveau, jamais la
 * couleur seule. Action facultative : lien de route (`actionLink`) ou bouton (`action`).
 */
@Component({
  selector: 'pm-status-banner',
  imports: [MatButtonModule, RouterLink],
  template: `
    <div class="banner" [class]="level()" role="status">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        @switch (level()) {
          @case ('success') {
            <path d="M5 12.5 10 17.5 19 7" />
          }
          @case ('warning') {
            <path d="M12 3 22 20H2Z M12 10v5 M12 17.5v.5" />
          }
          @default {
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6 M12 7.5v.5" />
          }
        }
      </svg>
      <span class="sr-only">{{ levelLabel() }} · </span>
      <span class="message">{{ message() }}</span>
      @if (actionLabel(); as label) {
        @if (actionLink(); as link) {
          <a class="action pm-link-target" [routerLink]="link">{{ label }}</a>
        } @else {
          <button mat-button type="button" class="action" (click)="action.emit()">
            {{ label }}
          </button>
        }
      }
    </div>
  `,
  styleUrl: './status-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBannerComponent {
  readonly level = input<BannerLevel>('warning');
  readonly message = input.required<string>();
  readonly actionLabel = input<string>();
  readonly actionLink = input<string>();
  readonly action = output<void>();

  protected levelLabel(): string {
    switch (this.level()) {
      case 'success':
        return $localize`:Mot du niveau d'un bandeau@@banner.level.success:Succès`;
      case 'info':
        return $localize`:Mot du niveau d'un bandeau@@banner.level.info:Information`;
      default:
        return $localize`:Mot du niveau d'un bandeau@@banner.level.warning:Avertissement`;
    }
  }
}
