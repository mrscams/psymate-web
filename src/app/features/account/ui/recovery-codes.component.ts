import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { uniqueId } from '../../../shared/util';

/** Nom du fichier téléchargé (fiche 18 B : « Télécharger (.txt) »). */
export const RECOVERY_CODES_FILENAME = 'psymate-codes-de-secours.txt';

/**
 * Les 10 codes de secours montrés une seule fois (fiche 18 B, étape 3) : liste étiquetée en deux
 * colonnes, Télécharger (.txt), Copier, et la case « Je les ai enregistrés » qui active l'action
 * finale du parent (`saved`). Le composant ne garde aucune copie des codes.
 */
@Component({
  selector: 'pm-recovery-codes',
  imports: [MatButtonModule],
  template: `
    <ul
      class="codes"
      aria-label="Codes de secours"
      i18n-aria-label="Étiquette de la liste des codes de secours@@account.security.recovery.list"
    >
      @for (code of codes(); track $index) {
        <li>
          <code>{{ code }}</code>
        </li>
      }
    </ul>
    <div class="actions">
      <button
        mat-stroked-button
        type="button"
        (click)="download()"
        i18n="Télécharger les codes de secours@@account.security.recovery.download"
      >
        Télécharger (.txt)
      </button>
      <button
        mat-stroked-button
        type="button"
        (click)="copy()"
        i18n="Copier les codes de secours@@account.security.recovery.copy"
      >
        Copier
      </button>
      <span class="status" role="status" aria-live="polite">{{ status() }}</span>
    </div>
    <label class="check">
      <input
        type="checkbox"
        [id]="checkboxId"
        [checked]="saved()"
        (change)="saved.set($any($event.target).checked)"
      />
      <span i18n="Case je les ai enregistrés@@account.security.recovery.saved"
        >Je les ai enregistrés</span
      >
    </label>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .codes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 16px;
      margin: 0;
      padding: 14px 16px;
      list-style: none;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-sunken);
    }
    code {
      font: 15px/1.5 var(--font-mono);
      letter-spacing: 0.08em;
      color: var(--text-primary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .status {
      min-height: 1.4em;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      font: var(--mat-sys-body-medium);
      color: var(--text-primary);
      cursor: pointer;

      input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: var(--primary);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryCodesComponent {
  readonly codes = input.required<readonly string[]>();
  /** Case « Je les ai enregistrés » : le parent n'active Terminer qu'à vrai. */
  readonly saved = model(false);

  private readonly document = inject(DOCUMENT);

  protected readonly checkboxId = uniqueId('pm-recovery-saved');
  protected readonly status = signal('');

  private readonly text = computed(() => {
    const header = $localize`:En-tête du fichier des codes de secours@@account.security.recovery.fileHeader:PsyMate · codes de secours de la double authentification. Chaque code ne sert qu'une fois.`;
    return `${header}\n\n${this.codes().join('\n')}\n`;
  });

  /** Fichier texte téléchargé par un lien éphémère (aucune donnée envoyée au serveur). */
  protected download(): void {
    const blob = new Blob([this.text()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = RECOVERY_CODES_FILENAME;
    link.rel = 'noopener';
    this.document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url));
    this.status.set(
      $localize`:Statut après le téléchargement des codes@@account.security.recovery.downloaded:Fichier téléchargé.`,
    );
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codes().join('\n'));
      this.status.set(
        $localize`:Statut après la copie des codes@@account.security.recovery.copied:Codes copiés.`,
      );
    } catch {
      this.status.set(
        $localize`:Copie refusée par le navigateur@@account.security.recovery.copyFailed:Copie impossible : sélectionnez les codes à la main.`,
      );
    }
  }
}
