// Composants partagés (fiche 00) : barres, layouts, en-tête patient, panneau latéral, états,
// toasts, confirmation, icônes et titre de repli des entrées. Ne se modifient que par une tâche dédiée.
export type { AppBarUser } from './app-bar/app-bar.component';
export { ACCOUNT_PATHS, AppBarComponent } from './app-bar/app-bar.component';
export { ADMIN_PATHS, AdminBarComponent } from './admin-bar/admin-bar.component';
export { AccountNavComponent, verificationBadge } from './account-nav/account-nav.component';
export * from './confirm-dialog';
export type { EntryType } from './entry-icon/entry-icon.component';
export { ENTRY_TYPES, EntryIconComponent, entryTypeLabel } from './entry-icon/entry-icon.component';
export type { EntryTitleOptions, EntryTitleSource } from './entry-icon/entry-title';
export { ENTRY_TITLE_EXCERPT, entryTitle } from './entry-icon/entry-title';
export type {
  PatientFlag,
  PatientHeaderInfo,
  PatientSessionInfo,
} from './patient-header/patient-header.component';
export { PATIENT_TABS, PatientHeaderComponent } from './patient-header/patient-header.component';
export { PUBLIC_PATHS, PublicLayoutComponent } from './public-layout/public-layout.component';
export * from './side-panel';
export type { SkeletonVariant, StateAction } from './state/state.component';
export { StateComponent } from './state/state.component';
export { NetworkBannerComponent } from './status-banner/network-banner.component';
export type { BannerLevel } from './status-banner/status-banner.component';
export { StatusBannerComponent } from './status-banner/status-banner.component';
export type { VerificationBanner } from './status-banner/verification-banner.component';
export {
  verificationBanner,
  VerificationBannerComponent,
} from './status-banner/verification-banner.component';
export * from './toast';
