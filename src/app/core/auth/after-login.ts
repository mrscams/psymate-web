import { AUTH_PATHS } from './auth-paths';
import { SessionUser } from './session.model';

/**
 * Où un compte connecté doit aller, quelle que soit la route demandée, tant que son état le bloque
 * (fiches 00, 18, 25, 27) ; null si rien ne le bloque. Partagé par statusGuard et afterLogin().
 */
export function statusRedirect(me: SessionUser): string | null {
  if (me.passwordChangeRequired) return AUTH_PATHS.firstLogin;
  switch (me.verificationStatus) {
    case 'email_pending':
      return AUTH_PATHS.confirmEmail;
    case 'rejected':
    case 'suspended':
    case 'closed':
      return AUTH_PATHS.suspended;
    default:
      return null;
  }
}

// Caractères de contrôle (U+0000 à U+001F, U+007F) : jamais dans une route légitime.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Le paramètre ?next= n'est suivi que s'il désigne une route interne de l'application : chemin
 * absolu, pas d'URL externe (//hôte, /\hôte), pas de retour sur /connexion.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || next.length > 2000 || CONTROL_CHARS.test(next)) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  const path = next.split(/[?#]/, 1)[0];
  if (path === AUTH_PATHS.login || path.startsWith(`${AUTH_PATHS.login}/`)) return null;
  return next;
}

/**
 * Triage après connexion : l'URL où envoyer le compte qui vient d'ouvrir une session.
 * 1. état bloquant (mot de passe à changer, e-mail à confirmer, compte refusé, suspendu ou clos) ;
 * 2. administrateur sans 2FA : première connexion, étape 2 (G Q5) ;
 * 3. la page demandée avant la connexion (?next=), si elle est interne ;
 * 4. sinon l'accueil du rôle : /admin pour un administrateur, /patients pour un praticien.
 * Un praticien en docs_pending, under_review ou needs_more entre normalement : le bandeau d'état
 * (fiche 13) lui rappelle son dossier.
 */
export function afterLogin(me: SessionUser, next?: string | null): string {
  const blocked = statusRedirect(me);
  if (blocked) return blocked;
  if (me.role === 'admin' && !me.twoFactorEnabled) return AUTH_PATHS.firstLogin;
  return safeNext(next) ?? (me.role === 'admin' ? AUTH_PATHS.admin : AUTH_PATHS.home);
}
