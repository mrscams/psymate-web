import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { StateComponent } from '../../../shared/ui';
import { stateKind, uniqueId } from '../../../shared/util';
import { TwoFactorStep, TwoFactorStore } from '../data/two-factor.store';
import { LockNoticeComponent } from './lock-notice.component';
import { QrCodeComponent } from './qr-code.component';
import { RecoveryCodesComponent } from './recovery-codes.component';
import { verifyErrorMessage } from './security-messages';

/** Code TOTP : six chiffres (le serveur reste juge, 422 INVALID_CODE). */
const TOTP_CODE = /^\d{6}$/;

/** « JBSW Y3DP EHPK … » : secret Base32 groupé par 4 pour la saisie à la main. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Activation de la double authentification en trois étapes (fiche 18 B ; réutilisée par la première
 * connexion, fiche 18 C) : 1 QR + secret (POST enable à l'ouverture), 2 code à six chiffres
 * (POST verify), 3 les 10 codes de secours, montrés une seule fois, avec la case « Je les ai
 * enregistrés » (`saved`) que le parent lit pour activer Terminer. Le store est propre à chaque
 * instance : le secret et les codes disparaissent avec le composant.
 */
@Component({
  selector: 'pm-two-factor-setup',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    StateComponent,
    LockNoticeComponent,
    QrCodeComponent,
    RecoveryCodesComponent,
  ],
  providers: [TwoFactorStore],
  templateUrl: './two-factor-setup.component.html',
  styleUrl: './two-factor-setup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorSetupComponent {
  /** Vrai quand les codes de secours ont été confirmés (étape 3). */
  readonly saved = model(false);
  /** Étape affichée, pour que le parent adapte son pied (Annuler / Terminer). */
  readonly stepChange = output<TwoFactorStep>();

  protected readonly store = inject(TwoFactorStore);
  private readonly injector = inject(Injector);

  protected readonly stateKind = stateKind;
  protected readonly codeId = uniqueId('pm-2fa-code');
  protected readonly groupedSecret = computed(() => groupSecret(this.store.secret()));
  protected readonly copyStatus = signal('');
  protected readonly message = computed(() =>
    verifyErrorMessage(this.store.verification().problem),
  );
  protected readonly locked = computed(() => this.store.verification().lockedUntil !== null);
  protected readonly busy = computed(() => this.store.verification().status === 'busy');

  protected readonly qrLabel = $localize`:Étiquette du QR code 2FA@@account.security.qr.label:QR code à scanner avec votre application d'authentification ; le secret affiché à côté en est l'équivalent.`;
  protected readonly retry = {
    label: $localize`:Réessayer la génération du secret@@account.security.enroll.retry:Réessayer`,
    handler: (): void => void this.store.start(),
  };

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.pattern(TOTP_CODE)]],
  });

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    void this.store.start();
    effect(() => this.stepChange.emit(this.store.step()));
    // À l'étape 2 le focus va au champ code (parcours clavier, fiche 18).
    effect(() => {
      if (this.store.step() === 'code') {
        afterNextRender(() => this.codeInput()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    });
    inject(DestroyRef).onDestroy(() => this.store.reset());
  }

  protected readonly steps: { key: TwoFactorStep; label: string }[] = [
    {
      key: 'scan',
      label: $localize`:Étape 1 du stepper 2FA@@account.security.step.scan:Scanner le QR`,
    },
    {
      key: 'code',
      label: $localize`:Étape 2 du stepper 2FA@@account.security.step.code:Saisir le code`,
    },
    {
      key: 'codes',
      label: $localize`:Étape 3 du stepper 2FA@@account.security.step.codes:Codes de secours`,
    },
  ];

  protected stepIndex(step: TwoFactorStep): number {
    return this.steps.findIndex((s) => s.key === step);
  }

  protected isDone(step: TwoFactorStep): boolean {
    return this.stepIndex(step) < this.stepIndex(this.store.step());
  }

  protected async copySecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.store.secret());
      this.copyStatus.set(
        $localize`:Statut après copie du secret@@account.security.secret.copied:Secret copié.`,
      );
    } catch {
      this.copyStatus.set(
        $localize`:Copie du secret refusée@@account.security.secret.copyFailed:Copie impossible : sélectionnez le secret à la main.`,
      );
    }
  }

  protected codeInvalid(): boolean {
    const control = this.form.controls.code;
    return control.invalid && (control.touched || control.dirty);
  }

  protected async verify(): Promise<void> {
    if (this.busy() || this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const ok = await this.store.verify(this.form.controls.code.value.trim());
    if (!ok) {
      if (this.store.verification().problem?.code === 'TWO_FACTOR_NOT_STARTED') {
        // Le secret en attente a disparu : le prochain enable le remplace (contrat).
        await this.store.start();
        return;
      }
      // reset() : le champ redevient vierge, le message du serveur remplace celui de forme.
      this.form.controls.code.reset('');
      afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.injector });
    }
  }
}
