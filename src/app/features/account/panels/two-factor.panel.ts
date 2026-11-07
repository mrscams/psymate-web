import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { SidePanelComponent } from '../../../shared/ui';
import { TwoFactorStep } from '../data/two-factor.store';
import { TwoFactorSetupComponent } from '../ui/two-factor-setup.component';

/** Résultat du panneau : `true` quand Terminer a été cliqué après confirmation des codes. */
export type TwoFactorPanelResult = true;

/**
 * Panneau « Activer la double authentification » (fiche 18 B, /mon-compte/securite/2fa) : les trois
 * étapes du composant d'activation, pied Annuler / Terminer (actif seulement une fois la case
 * « Je les ai enregistrés » cochée). Fermer avant verify abandonne le secret en attente.
 */
@Component({
  selector: 'pm-two-factor-panel',
  imports: [MatButtonModule, SidePanelComponent, TwoFactorSetupComponent],
  template: `
    <pm-side-panel [title]="title">
      <pm-two-factor-setup [(saved)]="saved" (stepChange)="step.set($event)" />
      <ng-container ngProjectAs="[pmPanelFooter]">
        @if (step() !== 'codes') {
          <button
            mat-button
            type="button"
            (click)="cancel()"
            i18n="Annuler l'activation de la 2FA@@account.security.panel.cancel"
          >
            Annuler
          </button>
        }
        <button
          mat-flat-button
          type="button"
          [disabled]="!saved()"
          (click)="finish()"
          i18n="Terminer l'activation de la 2FA@@account.security.panel.finish"
        >
          Terminer
        </button>
      </ng-container>
    </pm-side-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorPanel {
  private readonly ref = inject<DialogRef<TwoFactorPanelResult>>(DialogRef);

  protected readonly title = $localize`:Titre du panneau d'activation 2FA@@account.security.panel.title:Activer la double authentification`;
  protected readonly saved = signal(false);
  protected readonly step = signal<TwoFactorStep>('scan');

  protected cancel(): void {
    this.ref.close();
  }

  protected finish(): void {
    if (this.saved()) this.ref.close(true);
  }
}
