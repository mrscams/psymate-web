// Surface de core/auth (handbook §3) : session, gardes, triage après connexion.
export { afterLogin, safeNext, statusRedirect } from './after-login';
export { AUTH_PATHS } from './auth-paths';
export { authGuard, guestGuard } from './auth.guard';
export { provideApiClient } from './data/api-client.api';
export { toSessionUser } from './data/session.api';
export { roleGuard } from './role.guard';
export { provideSessionInitializer } from './session.initializer';
export type { Profession, Role, SessionUser, VerificationStatus } from './session.model';
export { SessionStore } from './session.store';
export { statusGuard } from './status.guard';
