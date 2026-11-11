import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { SidePanelComponent, StateComponent } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { TwoFactorStore } from '../data/two-factor.store';
import { RecoveryCodesComponent } from '../ui/recovery-codes.component';

/**
 * Panneau « Nouveaux codes de secours » (fiche 18 A, Régénérer) : POST regenerate à l'ouverture,
 * les 10 nouveaux codes montrés une seule fois, Terminer actif après la case cochée. Le serveur a
 * invalidé les anciens codes (200) : le bandeau le dit.
 */
@Component({
  selector: 'pm-recovery-codes-panel',
  imports: [MatButtonModule, SidePanelComponent, StateComponent, RecoveryCodesComponent],
  providers: [TwoFactorStore],
  template: `
    <pm-side-panel [title]="title">
      <div class="body">
        @if (stateKind(store.recoveryCodes()); as kind) {
          <pm-state
            [kind]="kind"
            skeleton="row"
            [lines]="5"
            [title]="errorTitle"
            [details]="store.recoveryCodes().problem?.code"
            [message]="errorMessage(store.recoveryCodes().problem?.code)"
            [action]="retry"
          />
        } @else {
          <p
            class="banner"
            role="status"
            i18n="Bandeau après régénération des codes@@account.security.regenerate.done"
          >
            Les 10 anciens codes ne fonctionnent plus. Conservez ces nouveaux codes en lieu sûr :
            chacun ne sert qu'une fois et ils ne seront plus affichés.
          </p>
          <pm-recovery-codes [codes]="store.codes()" [(saved)]="saved" />
        }
      </div>
      <ng-container ngProjectAs="[pmPanelFooter]">
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
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .banner {
      margin: 0;
      padding: 12px 16px;
      border-radius: 10px;
      color: var(--success);
      background: var(--success-bg);
      font: var(--mat-sys-body-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryCodesPanel {
  protected readonly store = inject(TwoFactorStore);
  private readonly ref = inject<DialogRef<true>>(DialogRef);

  protected readonly stateKind = stateKind;
  protected readonly title = $localize`:Titre du panneau des nouveaux codes@@account.security.regenerate.title:Nouveaux codes de secours`;
  protected readonly saved = signal(false);
  protected readonly errorTitle = $localize`:Titre de l'état erreur de la régénération des codes@@account.security.regenerate.errorTitle:Impossible de générer de nouveaux codes de secours`;
  protected readonly retry = {
    label: $localize`:Réessayer la régénération@@account.security.regenerate.retry:Réessayer`,
    handler: (): void => void this.store.regenerate(),
  };

  constructor() {
    void this.store.regenerate();
    inject(DestroyRef).onDestroy(() => this.store.reset());
  }

  protected errorMessage(code: string | undefined): string | undefined {
    return code === 'TWO_FACTOR_NOT_ENABLED'
      ? $localize`:Régénération sans 2FA active@@account.security.regenerate.notEnabled:La double authentification n'est pas active : aucun code à régénérer.`
      : undefined;
  }

  protected finish(): void {
    if (this.saved()) this.ref.close(true);
  }
}
