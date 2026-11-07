import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { AUTH_PATHS, SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { formatDateTime } from '../../../core/i18n';
import {
  ACCOUNT_PATHS,
  AccountNavComponent,
  ConfirmDialogService,
  SidePanelRef,
  SidePanelService,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { SecurityStore } from '../data/security.store';
import { DisableTwoFactorPanel } from '../panels/disable-two-factor.panel';
import {
  EmailChangePanel,
  EmailChangePanelData,
  EmailChangePanelResult,
} from '../panels/email-change.panel';
import {
  PasswordChangePanel,
  PasswordChangePanelData,
  PasswordChangePanelResult,
} from '../panels/password-change.panel';
import { RecoveryCodesPanel } from '../panels/recovery-codes.panel';
import { TwoFactorPanel, TwoFactorPanelResult } from '../panels/two-factor.panel';
import { UNAVAILABLE_MESSAGE } from '../ui/security-messages';
import { professionLabel } from './preferences.page';

/** Segment enfant de /mon-compte/securite qui ouvre le panneau d'activation (fiche 18 B). */
export const TWO_FACTOR_SEGMENT = '2fa';

/**
 * /mon-compte/securite (fiche 18 A) : cartes E-mail de connexion, Mot de passe, Double
 * authentification, Sessions actives (GET /api/me/security, session courante marquée, révocation
 * unitaire, « Déconnecter les autres appareils »), Connexion précédente. Les actions sensibles
 * s'ouvrent dans un panneau latéral ; /mon-compte/securite/2fa ouvre le panneau d'activation.
 */
@Component({
  selector: 'pm-security-page',
  imports: [MatButtonModule, AccountNavComponent, StateComponent],
  providers: [SecurityStore],
  templateUrl: './security.page.html',
  styleUrl: './security.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityPage {
  protected readonly store = inject(SecurityStore);
  protected readonly session = inject(SessionStore);
  private readonly panels = inject(SidePanelService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(LOCALE_ID);

  protected readonly stateKind = stateKind;

  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );
  protected readonly email = computed(() => this.session.me()?.email ?? '');
  protected readonly emailConfirmed = computed(
    () => this.session.verificationStatus() !== 'email_pending',
  );
  /** Après un 202 du changement d'e-mail : la nouvelle adresse attend sa confirmation. */
  protected readonly emailNotice = signal<string | null>(null);
  protected readonly isAdmin = this.session.isAdmin;
  protected readonly twoFactorEnabled = this.session.twoFactorEnabled;

  protected readonly revokeLabel = $localize`:Révoquer une session@@account.security.sessions.revoke:Déconnecter`;

  protected readonly retry = {
    label: $localize`:Réessayer le chargement des sessions@@account.security.sessions.retry:Réessayer`,
    handler: (): void => void this.store.load(),
  };

  /** « 2 appareils déconnectés », « Aucun autre appareil n'était connecté » (0 compris). */
  protected readonly revokedText = computed(() => {
    const count = this.store.revokedOthers();
    if (count === null) return '';
    if (count === 0) {
      return $localize`:Aucune autre session révoquée@@account.security.sessions.revokedNone:Aucun autre appareil n'était connecté.`;
    }
    return count === 1
      ? $localize`:Une session révoquée@@account.security.sessions.revokedOne:1 appareil déconnecté.`
      : $localize`:Plusieurs sessions révoquées@@account.security.sessions.revokedMany:${count}:count: appareils déconnectés.`;
  });

  protected readonly revokeMessage = computed(() => {
    const problem = this.store.revokeProblem() ?? this.store.revokeOthersProblem();
    return problem ? revokeErrorMessage(problem) : null;
  });

  private twoFactorPanel: SidePanelRef<TwoFactorPanelResult> | null = null;

  /** Vrai quand l'URL affichée est /mon-compte/securite/2fa (route enfant sans composant). */
  private readonly twoFactorRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.isTwoFactorRoute()),
    ),
    { initialValue: this.isTwoFactorRoute() },
  );

  constructor() {
    void this.store.load();
    effect(() => {
      if (this.twoFactorRoute()) untracked(() => void this.openTwoFactorPanel());
    });
  }

  protected formatDate(value: string): string {
    return formatDateTime(value, this.locale);
  }

  protected deviceLabel(device: string | null): string {
    return (
      device ??
      $localize`:Appareil inconnu d'une session@@account.security.sessions.unknownDevice:Appareil non identifié`
    );
  }

  /** « Activer » : la route /2fa ouvre le panneau (lien partageable, retour arrière cohérent). */
  protected activateTwoFactor(): void {
    void this.router.navigate([TWO_FACTOR_SEGMENT], { relativeTo: this.route });
  }

  protected async regenerate(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: $localize`:Confirmation avant régénération@@account.security.regenerate.confirmTitle:Régénérer les codes de secours ?`,
      description: $localize`:Explication de la confirmation@@account.security.regenerate.confirmBody:Les 10 anciens codes cesseront de fonctionner. Les 10 nouveaux ne seront affichés qu'une seule fois.`,
      confirmLabel: $localize`:Bouton de la confirmation@@account.security.regenerate.confirmButton:Régénérer`,
    });
    if (!ok) return;
    const ref = this.panels.open<RecoveryCodesPanel, undefined, true>(RecoveryCodesPanel);
    if ((await ref?.closed) === true) {
      this.toasts.success(
        $localize`:Toast après régénération@@account.security.regenerate.toast:Nouveaux codes de secours enregistrés.`,
      );
    }
  }

  protected async disableTwoFactor(): Promise<void> {
    const ref = this.panels.open<DisableTwoFactorPanel, undefined, true>(DisableTwoFactorPanel);
    if ((await ref?.closed) === true) {
      this.toasts.success(
        $localize`:Toast après désactivation@@account.security.disable.toast:Double authentification désactivée.`,
      );
    }
  }

  protected async changePassword(): Promise<void> {
    const ref = this.panels.open<
      PasswordChangePanel,
      PasswordChangePanelData,
      PasswordChangePanelResult
    >(PasswordChangePanel, { data: { email: this.email() } });
    if ((await ref?.closed) !== 'changed') return;
    // Le serveur a révoqué toutes les sessions (204) : on oublie la session locale et on se reconnecte.
    this.toasts.success(
      $localize`:Toast après changement de mot de passe@@account.security.password.toast:Mot de passe changé. Reconnectez-vous avec le nouveau mot de passe.`,
    );
    this.session.clear();
    await this.router.navigateByUrl(AUTH_PATHS.login);
  }

  protected async changeEmail(): Promise<void> {
    const ref = this.panels.open<EmailChangePanel, EmailChangePanelData, EmailChangePanelResult>(
      EmailChangePanel,
      { data: { currentEmail: this.email() } },
    );
    const sentTo = await ref?.closed;
    if (sentTo) {
      this.emailNotice.set(
        $localize`:Après un 202 du changement d'e-mail@@account.security.email.sent:Un lien de confirmation a été envoyé à ${sentTo}:email:. L'adresse actuelle reste valable jusqu'à ce qu'il soit ouvert (24 h).`,
      );
    }
  }

  protected async revokeSession(id: string): Promise<void> {
    await this.store.revokeSession(id);
  }

  protected async revokeOthers(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: $localize`:Confirmation avant déconnexion des autres appareils@@account.security.sessions.confirmTitle:Déconnecter les autres appareils ?`,
      description: $localize`:Explication de la confirmation@@account.security.sessions.confirmBody:Cet appareil reste connecté. Les autres devront se reconnecter ; l'opération est consignée côté serveur.`,
      confirmLabel: $localize`:Bouton de la confirmation@@account.security.sessions.confirmButton:Déconnecter`,
    });
    if (ok) await this.store.revokeOthers();
  }

  private isTwoFactorRoute(): boolean {
    return this.route.firstChild?.snapshot.url[0]?.path === TWO_FACTOR_SEGMENT;
  }

  private async openTwoFactorPanel(): Promise<void> {
    if (this.twoFactorPanel) return;
    if (this.twoFactorEnabled()) {
      await this.leaveTwoFactorRoute();
      return;
    }
    const ref = this.panels.open<TwoFactorPanel, undefined, TwoFactorPanelResult>(TwoFactorPanel);
    if (!ref) return;
    this.twoFactorPanel = ref;
    const result = await ref.closed;
    this.twoFactorPanel = null;
    if (result === true) {
      this.toasts.success(
        $localize`:Toast après activation de la 2FA@@account.security.enabled.toast:Double authentification activée.`,
      );
    } else if (this.twoFactorEnabled()) {
      this.toasts.warning(
        $localize`:Panneau fermé avant la confirmation des codes@@account.security.enabled.unsavedCodes:Double authentification activée, mais vos codes de secours n'ont pas été confirmés : régénérez-les pour en obtenir de nouveaux.`,
      );
    }
    await this.leaveTwoFactorRoute();
  }

  /** Le panneau est fermé : l'URL revient sur /mon-compte/securite si elle était encore sur /2fa. */
  private async leaveTwoFactorRoute(): Promise<void> {
    if (this.isTwoFactorRoute()) await this.router.navigateByUrl(ACCOUNT_PATHS.security);
  }
}

function revokeErrorMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'SESSION_NOT_FOUND':
      return $localize`:Session déjà fermée@@account.security.sessions.notFound:Cette session n'existe plus : elle a expiré ou a déjà été fermée.`;
    case 'CURRENT_SESSION':
      return $localize`:Révocation de la session courante refusée@@account.security.sessions.currentRefused:C'est votre session actuelle : utilisez la déconnexion.`;
    default:
      return UNAVAILABLE_MESSAGE;
  }
}
