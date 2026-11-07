import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { formatDate } from '../../../core/i18n';
import { ApiProblem } from '../../../core/http';
import { VerificationDocument } from '../data/verification.api';
import { documentTypeLabel, formatBytes, reviewStatusLabel } from './document-labels';

/**
 * Liste des justificatifs déposés (fiche 13 §5) : intitulé · établissement · année, type · taille ·
 * date, statut En attente / Conforme / Non conforme, bouton Retirer nommant le document (seulement
 * quand le dossier est modifiable), lien Voir (URL signée 5 min). La liste vide est affichée par la
 * page avec pm-state.
 */
@Component({
  selector: 'pm-document-list',
  imports: [MatButtonModule],
  template: `
    <ul class="documents" [attr.aria-label]="listLabel">
      @for (doc of documents(); track doc.id) {
        <li class="document" [class.purged]="doc.purged">
          <span class="icon" aria-hidden="true">{{
            doc.mime === 'application/pdf' ? 'PDF' : 'IMG'
          }}</span>
          <div class="body">
            <p class="title">
              {{ doc.title }}
              @if (doc.issuer) {
                <span class="muted"> · {{ doc.issuer }}</span>
              }
              @if (doc.year) {
                <span class="muted"> · {{ doc.year }}</span>
              }
            </p>
            <p class="meta">
              {{ typeLabel(doc) }} · <span class="mono">{{ sizeOf(doc) }}</span> ·
              <span i18n="Date de dépôt d'un justificatif@@account.verification.doc.uploadedAt"
                >déposé le {{ dateOf(doc) }}</span
              >
            </p>
          </div>
          <span class="status" [class]="'status ' + doc.reviewedStatus">{{
            statusLabel(doc)
          }}</span>
          <div class="actions">
            @if (!doc.purged) {
              <button
                mat-button
                type="button"
                (click)="open.emit(doc.id)"
                [attr.aria-label]="openLabel(doc)"
                i18n="Bouton voir un justificatif@@account.verification.doc.open"
              >
                Voir
              </button>
            }
            @if (editable()) {
              <button
                mat-button
                type="button"
                class="remove"
                [disabled]="removing() === doc.id"
                [attr.aria-label]="removeLabel(doc)"
                (click)="remove.emit(doc.id)"
                i18n="Bouton retirer un justificatif@@account.verification.doc.remove"
              >
                Retirer
              </button>
            }
          </div>
        </li>
      }
    </ul>
    @if (removeProblem(); as problem) {
      <p class="error" role="alert">{{ removeMessage(problem) }}</p>
    }
  `,
  styles: `
    .documents {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .document {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: var(--mat-sys-label-small);
      font-family: var(--font-mono);
    }
    .title,
    .meta {
      margin: 0;
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .meta {
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .muted {
      color: var(--text-secondary);
      font-weight: 400;
    }
    .mono {
      font-family: var(--font-mono);
    }
    .status {
      padding: 4px 10px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      white-space: nowrap;
    }
    .status.pending {
      background: var(--warning-bg);
      color: var(--warning);
    }
    .status.conform {
      background: var(--success-bg);
      color: var(--success);
    }
    .status.non_conform {
      background: var(--danger-bg);
      color: var(--danger);
    }
    .actions {
      display: flex;
      gap: 4px;
    }
    .remove {
      color: var(--danger);
    }
    .purged {
      opacity: 0.7;
    }
    .error {
      margin: 8px 0 0;
      color: var(--danger);
      font: var(--mat-sys-body-small);
    }
    @media (max-width: 600px) {
      .document {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .status,
      .actions {
        grid-column: 2;
        justify-self: start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentListComponent {
  readonly documents = input.required<VerificationDocument[]>();
  /** Dossier modifiable (docs_pending, needs_more) : bouton Retirer affiché. */
  readonly editable = input(false);
  readonly removing = input<string | null>(null);
  readonly removeProblem = input<ApiProblem | null>(null);
  readonly remove = output<string>();
  readonly open = output<string>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly listLabel = $localize`:Étiquette de la liste des justificatifs@@account.verification.docs.listLabel:Justificatifs déposés`;

  protected typeLabel(doc: VerificationDocument): string {
    return documentTypeLabel(doc.type);
  }

  protected statusLabel(doc: VerificationDocument): string {
    return reviewStatusLabel(doc.reviewedStatus);
  }

  protected sizeOf(doc: VerificationDocument): string {
    return formatBytes(doc.sizeBytes, this.locale);
  }

  protected dateOf(doc: VerificationDocument): string {
    return formatDate(doc.uploadedAt, this.locale);
  }

  protected removeLabel(doc: VerificationDocument): string {
    return $localize`:Nom accessible du bouton Retirer@@account.verification.doc.removeLabel:Retirer ${doc.title}:title:`;
  }

  protected openLabel(doc: VerificationDocument): string {
    return $localize`:Nom accessible du bouton Voir@@account.verification.doc.openLabel:Voir ${doc.title}:title:`;
  }

  protected removeMessage(problem: ApiProblem): string {
    if (problem.status === 409) {
      return $localize`:Retrait refusé, dossier verrouillé@@account.verification.doc.remove.locked:Ce justificatif ne peut plus être retiré : le dossier n'est plus modifiable.`;
    }
    return $localize`:Retrait impossible@@account.verification.doc.remove.failed:Le retrait a échoué. Rien n'a été modifié.`;
  }
}
