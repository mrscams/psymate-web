import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { ACCOUNT_PATHS } from '../../../shared/ui';
import { PatientExportFormat } from '../data/patient-export.api';
import { PatientExportStore } from '../data/patient-export.store';
import { saveFile } from './save-file';

/**
 * « Exporter ce dossier ▾ » (fiche 16, état C de la fiche 19) : menu PDF / Markdown
 * (`aria-haspopup="menu"`, `role="menu"` / `menuitem`, flèches et `Échap` par MatMenu),
 * téléchargement direct du fichier, note « Entrées privées exclues ». Exporté par l'index de
 * features/patients pour l'en-tête patient (point d'entrée secondaire).
 */
@Component({
  selector: 'pm-patient-export-menu',
  imports: [MatButtonModule, MatMenuModule, RouterLink],
  providers: [PatientExportStore],
  template: `
    <button
      mat-stroked-button
      type="button"
      class="trigger"
      [matMenuTriggerFor]="formats"
      [disabled]="busy()"
    >
      <span i18n="Bouton du menu d'export du dossier@@patients.export.button"
        >Exporter ce dossier</span
      >
      <span aria-hidden="true">▾</span>
    </button>
    <mat-menu
      #formats="matMenu"
      aria-label="Format d'export"
      i18n-aria-label="Étiquette du menu des formats d'export@@patients.export.menu"
    >
      <button mat-menu-item type="button" (click)="export('pdf')">
        <span class="item">
          <span i18n="Format PDF du menu d'export@@patients.export.pdf">PDF</span>
          <span class="hint" i18n="Détail du format PDF@@patients.export.pdfHint"
            >thème clair · à imprimer</span
          >
        </span>
      </button>
      <button mat-menu-item type="button" (click)="export('md')">
        <span class="item">
          <span i18n="Format Markdown du menu d'export@@patients.export.md">Markdown</span>
          <span class="hint" i18n="Détail du format Markdown@@patients.export.mdHint"
            >texte brut · réutilisable</span
          >
        </span>
      </button>
    </mat-menu>
    <p class="status" role="status">{{ statusText() }}</p>
    @if (errorText(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
    @if (!compact()) {
      <p class="note" i18n="Rappel sous le menu d'export@@patients.export.note">
        <strong>Entrées privées exclues</strong>, ainsi que les entrées archivées. Ordre
        chronologique, version courante du texte.
      </p>
      <p class="note">
        <span i18n="Téléchargement direct@@patients.export.direct"
          >Téléchargement immédiat, rien n'est conservé côté serveur. Pour tous vos dossiers d'un
          coup :</span
        >
        <a
          [routerLink]="accountDataPath"
          i18n="Lien vers Données et export@@patients.export.accountLink"
          >Mon compte › Données et export</a
        >
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .item {
      display: flex;
      flex-direction: column;
    }
    .hint {
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .note {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .note strong {
      color: var(--text-primary);
    }
    .note a {
      margin-left: 4px;
      color: var(--primary);
    }
    .status,
    .error {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    .status {
      color: var(--text-secondary);
    }
    .error {
      padding: 8px 12px;
      border-radius: 8px;
      color: var(--danger);
      background: var(--danger-bg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientExportMenuComponent {
  readonly patientId = input.required<string>();
  /** Sans les notes (en-tête patient) : le bouton et son menu seulement. */
  readonly compact = input(false);

  private readonly store = inject(PatientExportStore);
  private readonly document = inject(DOCUMENT);

  protected readonly accountDataPath = ACCOUNT_PATHS.data;

  protected readonly busy = computed(() => this.store.status() === 'busy');
  protected readonly statusText = computed(() =>
    this.busy()
      ? $localize`:Fichier en préparation@@patients.export.busy:Préparation du fichier…`
      : '',
  );
  protected readonly errorText = computed(() => exportErrorText(this.store.problem()));

  protected async export(format: PatientExportFormat): Promise<void> {
    if (this.busy()) return;
    const file = await this.store.exportFile(this.patientId(), format);
    if (file) saveFile(this.document, file);
  }
}

/** Message d'un export refusé : le corps d'erreur d'un téléchargement est un blob, seul le statut compte. */
export function exportErrorText(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 0:
      return $localize`:Export patient hors ligne@@patients.export.error.offline:Connexion perdue : réessayez une fois le réseau revenu.`;
    case 403:
      return $localize`:Export patient refusé@@patients.export.error.forbidden:Ce dossier n'est pas accessible depuis votre compte.`;
    case 404:
      return $localize`:Export patient introuvable@@patients.export.error.notFound:Ce dossier n'existe pas ou plus.`;
    case 429:
      return $localize`:Export patient limité@@patients.export.error.rateLimited:Trop de demandes rapprochées : réessayez dans quelques instants.`;
    default:
      return $localize`:Export patient en échec@@patients.export.error.failed:La génération du fichier a échoué. Rien n'a été modifié ; réessayez dans un instant.`;
  }
}
