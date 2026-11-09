import { DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { ShortcutService } from '../../../core/shortcuts';
import { ConfirmDialogService, SidePanelComponent } from '../../../shared/ui';
import { TwoFactorStep } from '../data/two-factor.store';
import { TwoFactorSetupComponent } from '../ui/two-factor-setup.component';

/** Résultat du panneau : `true` quand Terminer a été cliqué après confirmation des codes. */
export type TwoFactorPanelResult = true;

/**
 * Panneau « Activer la double authentification » (fiche 18 B, /mon-compte/securite/2fa) : les trois
 * étapes du composant d'activation, pied Annuler / Terminer (actif seulement une fois la case
 * « Je les ai enregistrés » cochée). Échap, le voile et Annuler demandent confirmation tant qu'un
 * secret est en attente ou que les codes ne sont pas confirmés (fiche 18, Accessibilité) : le
 * panneau reprend Échap au service (dernière inscription) et désactive la fermeture du CDK ; la
 * croix du cadre reste une fermeture explicite, sans confirmation.
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
            (click)="requestClose()"
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
  private readonly confirm = inject(ConfirmDialogService);

  protected readonly title = $localize`:Titre du panneau d'activation 2FA@@account.security.panel.title:Activer la double authentification`;
  protected readonly saved = signal(false);
  protected readonly step = signal<TwoFactorStep>('scan');

  /** Une confirmation est ouverte : Échap et le voile n'en ouvrent pas une seconde. */
  private confirming = false;

  constructor() {
    // Le CDK ne ferme plus seul (Échap, voile) : la décision passe par requestClose().
    this.ref.disableClose = true;
    const shortcuts = inject(ShortcutService);
    const backdrop = this.ref.backdropClick.subscribe(() => void this.requestClose());
    let release: (() => void) | null = null;
    // Après le premier rendu : SidePanelService inscrit Échap juste après avoir créé le composant ;
    // l'inscription du panneau doit venir ensuite pour être la dernière (celle qui l'emporte).
    afterNextRender(() => {
      release = shortcuts.register(
        'Escape',
        () => void this.requestClose(),
        $localize`:Aide des raccourcis, activation de la double authentification@@account.security.panel.escape:Fermer le panneau, après confirmation si l'activation n'est pas terminée`,
      );
    });
    inject(DestroyRef).onDestroy(() => {
      release?.();
      backdrop.unsubscribe();
    });
  }

  /** Échap, voile ou Annuler : confirmation si l'activation n'est pas terminée. */
  protected async requestClose(): Promise<void> {
    if (this.confirming) return;
    if (this.saved()) {
      this.finish();
      return;
    }
    this.confirming = true;
    try {
      const ok = await this.confirm.confirm(
        this.step() === 'codes'
          ? {
              title: $localize`:Confirmation avant de fermer sans les codes@@account.security.panel.leaveCodes.title:Fermer sans avoir enregistré vos codes de secours ?`,
              description: $localize`:Explication, codes montrés une seule fois@@account.security.panel.leaveCodes.body:La double authentification est déjà active. Ces 10 codes ne seront plus affichés ; vous pourrez en régénérer de nouveaux depuis Compte et sécurité.`,
              confirmLabel: $localize`:Bouton fermer sans les codes@@account.security.panel.leaveCodes.confirm:Fermer sans enregistrer`,
              destructive: true,
            }
          : {
              title: $localize`:Confirmation avant d'abandonner l'activation@@account.security.panel.abandon.title:Abandonner l'activation ?`,
              description: $localize`:Explication, secret en attente@@account.security.panel.abandon.body:La double authentification ne sera pas activée. Le secret affiché sera remplacé au prochain essai.`,
              confirmLabel: $localize`:Bouton abandonner l'activation@@account.security.panel.abandon.confirm:Abandonner`,
            },
      );
      if (ok) this.ref.close();
    } finally {
      this.confirming = false;
    }
  }

  protected finish(): void {
    if (this.saved()) this.ref.close(true);
  }
}
