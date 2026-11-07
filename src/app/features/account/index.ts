// Surface publique de features/account (handbook §5) : ses routes, et les briques de sécurité que
// la première connexion (features/auth, fiche 18 C) réutilise : activation de la 2FA en trois
// étapes, règles du mot de passe, verrou 423.
export { ACCOUNT_ROUTES } from './account.routes';
export { LockNoticeComponent } from './ui/lock-notice.component';
export { PasswordRulesComponent } from './ui/password-rules.component';
export { TwoFactorSetupComponent } from './ui/two-factor-setup.component';
