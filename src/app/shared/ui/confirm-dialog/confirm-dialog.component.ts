import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Libellé du bouton de confirmation ; « Confirmer » par défaut. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action irréversible : bouton --danger (archiver, supprimer). */
  destructive?: boolean;
  /**
   * Mot à retaper à l'identique avant de pouvoir confirmer (le nom exact d'un vrai patient, fiche 16) ;
   * absent, le bouton est actif d'emblée (patient DEMO, planche 29).
   */
  confirmWord?: string;
}

/**
 * Boîte de confirmation (fiche 00 §7, planche 29) sur MatDialog : `role="dialog"`,
 * `aria-modal="true"`, focus initial sur le champ s'il existe, `Échap` annule. Variante destructive
 * avec le mot à retaper. Ouverte par ConfirmDialogService.
 */
@Component({
  selector: 'pm-confirm-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly options = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialogComponent, boolean>>(MatDialogRef);

  protected readonly typed = signal('');

  protected readonly canConfirm = computed(() => {
    const word = this.options.confirmWord;
    return !word || this.typed().trim() === word.trim();
  });

  protected readonly confirmLabel =
    this.options.confirmLabel ??
    $localize`:Bouton par défaut d'une confirmation@@confirm.confirm:Confirmer`;
  protected readonly cancelLabel =
    this.options.cancelLabel ??
    $localize`:Bouton d'annulation d'une confirmation@@confirm.cancel:Annuler`;
  protected readonly wordLabel = $localize`:Étiquette du champ où retaper le nom@@confirm.word.label:Tapez « ${this.options.confirmWord ?? ''}:word: » pour confirmer`;

  protected confirm(): void {
    if (this.canConfirm()) this.ref.close(true);
  }

  protected cancel(): void {
    this.ref.close(false);
  }
}
