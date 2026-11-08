import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { formatDate, formatDateTime } from '../../../../core/i18n';
import { ExportStatus } from '../../data/data-export.api';
import { ExportRowKind } from '../../data/export.store';

/**
 * Ligne « Dernier export » (fiche 19, Interactions) : date de demande en JetBrains Mono, pastille
 * d'état (le mot, jamais la couleur seule) et action. `queued` « En attente » ; `running` « En
 * préparation » avec indicateur indéterminé ; `done` « Prêt · lien valable jusqu'au … » +
 * « Télécharger » ; `failed` « Échec » + motif + « Relancer » ; expiré « Expiré » + « Relancer ».
 */
@Component({
  selector: 'pm-export-job-row',
  imports: [MatButtonModule, MatProgressBarModule],
  template: `
    @if (job(); as data) {
      <div class="row">
        <span class="requested">
          <span class="sr-only" i18n="Préfixe lu de la date de demande@@account.data.job.requested"
            >Demandé le</span
          >
          <span class="mono">{{ requestedAt() }}</span>
        </span>
        @switch (kind()) {
          @case ('queued') {
            <span class="pill neutral" i18n="État du job : en attente@@account.data.job.queued"
              >En attente</span
            >
            <span class="detail" i18n="Détail de l'attente@@account.data.job.queuedBody"
              >La préparation commence dans un instant ; actualisation automatique.</span
            >
          }
          @case ('running') {
            <span class="pill warn" i18n="État du job : en préparation@@account.data.job.running"
              >En préparation</span
            >
            <span class="detail" i18n="Détail de la préparation@@account.data.job.runningBody"
              >Actualisation automatique.</span
            >
          }
          @case ('ready') {
            <span class="pill ok" i18n="État du job : prêt@@account.data.job.ready">Prêt</span>
            <span class="detail" i18n="Validité du lien@@account.data.job.validUntil"
              >lien valable jusqu'au <span class="mono">{{ expiresAt() }}</span></span
            >
            <button
              mat-flat-button
              type="button"
              class="action"
              [disabled]="downloading()"
              (click)="download.emit()"
              i18n="Bouton de téléchargement du zip@@account.data.job.download"
            >
              Télécharger
            </button>
          }
          @case ('expired') {
            <span class="pill neutral" i18n="État du job : expiré@@account.data.job.expired"
              >Expiré</span
            >
            <span class="detail" i18n="Détail du lien expiré@@account.data.job.expiredBody"
              >Le lien de 7 jours a expiré et le fichier a été purgé.</span
            >
            <button
              mat-stroked-button
              type="button"
              class="action"
              [disabled]="relaunchDisabled()"
              (click)="relaunch.emit()"
              i18n="Bouton relancer l'export@@account.data.job.relaunch"
            >
              Relancer
            </button>
          }
          @case ('failed') {
            <span class="pill danger" i18n="État du job : échec@@account.data.job.failed"
              >Échec</span
            >
            @if (data.error) {
              <span class="detail mono">{{ data.error }}</span>
            }
            <button
              mat-stroked-button
              type="button"
              class="action"
              [disabled]="relaunchDisabled()"
              (click)="relaunch.emit()"
              i18n="Bouton relancer l'export@@account.data.job.relaunch"
            >
              Relancer
            </button>
          }
        }
      </div>
      @if (kind() === 'running') {
        <mat-progress-bar mode="indeterminate" [attr.aria-label]="progressLabel" />
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      padding: 12px 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
    }
    .mono {
      font-family: var(--font-mono);
    }
    .detail {
      flex: 1 1 200px;
      color: var(--text-secondary);
      font: var(--mat-sys-body-medium);
    }
    .detail.mono {
      font-family: var(--font-mono);
    }
    .action {
      margin-left: auto;
    }
    .pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font: var(--mat-sys-label-medium);
      font-weight: 600;
    }
    .neutral {
      background: var(--surface-sunken);
      color: var(--text-secondary);
    }
    .warn {
      background: var(--warning-bg);
      color: var(--warning);
    }
    .ok {
      background: var(--success-bg);
      color: var(--success);
    }
    .danger {
      background: var(--danger-bg);
      color: var(--danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportJobRowComponent {
  readonly kind = input.required<ExportRowKind>();
  readonly job = input<ExportStatus | null>(null);
  readonly downloading = input(false);
  readonly relaunchDisabled = input(false);

  readonly download = output<void>();
  readonly relaunch = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly progressLabel = $localize`:Étiquette de l'indicateur de préparation@@account.data.job.progress:Préparation de l'export en cours`;

  protected readonly requestedAt = computed(() => {
    const value = this.job()?.requestedAt;
    return value ? formatDateTime(value, this.locale) : '';
  });
  protected readonly expiresAt = computed(() => {
    const value = this.job()?.expiresAt;
    return value ? formatDate(value, this.locale, 'medium') : '';
  });
}
