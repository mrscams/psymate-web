import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { VocabularyEntry } from '../data/admin.model';

export interface DeactivateDialogData {
  entry: VocabularyEntry;
  /** PATCH {active:false} : null si fait, sinon le problème (409 VOCABULARY_IN_USE…). */
  submit: () => Promise<ApiProblem | null>;
}

/**
 * « Désactiver… » (fiche 28) : `role="dialog"`, focus initial sur le bouton de sortie, Échap ferme.
 * Si l'API répond 409 VOCABULARY_IN_USE, encart danger « Utilisée par N profils publiés » avec un
 * lien vers les praticiens et « Fermer » ; la ligne reste active.
 */
@Component({
  selector: 'pm-deactivate-dialog',
  imports: [MatButtonModule, MatDialogModule, RouterLink],
  template: `
    <h2
      mat-dialog-title
      id="deactivate-title"
      i18n="Titre de la désactivation@@admin.vocabulary.deactivateTitle"
    >
      Désactiver « {{ data.entry.labelFr }} » ?
    </h2>
    <mat-dialog-content>
      <p
        id="deactivate-description"
        i18n="Effets de la désactivation@@admin.vocabulary.deactivateDescription"
      >
        L'entrée disparaît de la liste proposée aux praticiens et des filtres de l'annuaire. Elle
        n'est jamais supprimée : vous pourrez la réactiver.
      </p>
      @if (inUse() !== null) {
        <div class="in-use" role="alert">
          <p>
            <span i18n="Nombre de profils qui utilisent l'entrée@@admin.vocabulary.inUseCount"
              >Utilisée par
              {inUse(), plural,
                =0 {aucun profil publié}
                =1 {1 profil publié}
                other {{{ inUse() }} profils publiés}
              }</span
            >
            <span i18n="Encart d'une entrée utilisée@@admin.vocabulary.inUse"
              >: demandez d'abord aux praticiens de la retirer ou choisissez une spécialité de
              remplacement.</span
            >
          </p>
          <a
            routerLink="/admin/praticiens"
            [queryParams]="{ status: 'approved' }"
            (click)="close()"
            i18n="Lien vers les praticiens@@admin.vocabulary.inUseLink"
            >Voir les praticiens approuvés</a
          >
        </div>
      }
      @if (error(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (inUse() === null) {
        <button
          mat-stroked-button
          type="button"
          cdkFocusInitial
          (click)="close()"
          [disabled]="sending()"
        >
          {{ cancelLabel }}
        </button>
        <button
          mat-flat-button
          type="button"
          class="danger"
          [disabled]="sending()"
          (click)="confirm()"
          i18n="Bouton de désactivation@@admin.vocabulary.deactivateConfirm"
        >
          Désactiver
        </button>
      } @else {
        <button
          mat-flat-button
          type="button"
          (click)="close()"
          i18n="Bouton de fermeture@@admin.vocabulary.close"
          #closeButton
        >
          Fermer
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .in-use {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
      border: 1px solid var(--danger);
      border-radius: 10px;
      background: var(--danger-bg);
      color: var(--danger);

      p {
        margin: 0;
      }

      a {
        color: var(--danger);
        font-weight: 600;
      }
    }

    .error {
      color: var(--danger);
    }

    button.danger:not(:disabled) {
      --mat-button-filled-container-color: var(--danger);
      --mat-button-filled-label-text-color: var(--danger-on);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeactivateDialogComponent {
  protected readonly data = inject<DeactivateDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DeactivateDialogComponent, boolean>>(MatDialogRef);

  private readonly closeButton = viewChild('closeButton', { read: ElementRef });

  protected readonly cancelLabel = $localize`:Bouton d'annulation d'une confirmation@@confirm.cancel:Annuler`;
  protected readonly sending = signal(false);
  /** Compteur du 409 VOCABULARY_IN_USE ; null tant qu'il n'y en a pas. */
  protected readonly inUse = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async confirm(): Promise<void> {
    this.sending.set(true);
    this.error.set(null);
    const problem = await this.data.submit();
    this.sending.set(false);
    if (!problem) {
      this.ref.close(true);
      return;
    }
    if (problem.code === 'VOCABULARY_IN_USE') {
      const count = problem.extra?.['usedByPublishedProfiles'];
      this.inUse.set(typeof count === 'number' ? count : this.data.entry.usedByPublishedProfiles);
      // Le bouton « Fermer » remplace les deux autres : il reçoit le focus.
      setTimeout(() => (this.closeButton()?.nativeElement as HTMLElement | undefined)?.focus());
      return;
    }
    this.error.set(
      problem.detail ??
        $localize`:Erreur de désactivation@@admin.vocabulary.deactivateError:La désactivation n'a pas pu être enregistrée.`,
    );
  }

  protected close(): void {
    this.ref.close(false);
  }
}
