import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

/** « 14:59 » : minutes et secondes restantes. */
export function formatLockDelay(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * Verrou après 5 échecs (423 + retryAfterSeconds, fiches 11 et 18) : compte à rebours lisible,
 * `role="alert"`, puis `expired` quand il atteint zéro pour que le parent réactive ses boutons.
 * Rien n'est rendu sans verrou.
 */
@Component({
  selector: 'pm-lock-notice',
  template: `
    @if (seconds() > 0) {
      <p
        class="banner"
        role="alert"
        i18n="Verrou après 5 échecs, compte à rebours@@account.security.locked"
      >
        Trop d'essais. Réessayez dans {{ delay() }}.
      </p>
    }
  `,
  styles: `
    .banner {
      margin: 8px 0;
      padding: 12px 16px;
      border-radius: 10px;
      color: var(--warning);
      background: var(--warning-bg);
      font: var(--mat-sys-body-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockNoticeComponent {
  /** Fin du verrou en millisecondes depuis l'époque ; null : aucun verrou. */
  readonly until = input<number | null>(null);
  readonly expired = output<void>();

  private readonly now = signal(Date.now());

  protected readonly seconds = computed(() => {
    const until = this.until();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly delay = computed(() => formatLockDelay(this.seconds()));

  constructor() {
    effect((onCleanup) => {
      if (this.until() === null) return;
      this.now.set(Date.now());
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (this.seconds() === 0) {
          clearInterval(timer);
          this.expired.emit();
        }
      }, 1000);
      onCleanup(() => clearInterval(timer));
    });
  }
}
