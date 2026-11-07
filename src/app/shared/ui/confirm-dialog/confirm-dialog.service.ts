import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogComponent, ConfirmOptions } from './confirm-dialog.component';

/**
 * `await confirm({ title, destructive, confirmWord })` → true si confirmé, false si annulé (bouton,
 * Échap ou clic hors de la boîte). Le focus revient à l'élément déclencheur (MatDialog).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmOptions, boolean>(
      ConfirmDialogComponent,
      {
        data: options,
        role: 'dialog',
        ariaModal: true,
        autoFocus: options.confirmWord ? 'input' : 'first-tabbable',
        restoreFocus: true,
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'pm-confirm-dialog',
      },
    );
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
