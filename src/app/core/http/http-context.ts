import { HttpContextToken } from '@angular/common/http';

/**
 * Posé sur une requête dont le 401 est attendu et traité par l'appelant (GET /api/auth/me au
 * démarrage) : auth-redirect.interceptor ne redirige pas vers /connexion.
 */
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);

/** Posé par retry-after.interceptor sur le rejeu d'un GET après un 429 : un seul rejeu. */
export const REPLAYED_AFTER_429 = new HttpContextToken<boolean>(() => false);

/** Posé par offline.interceptor sur le rejeu d'une requête au retour du réseau : un seul rejeu. */
export const REPLAYED_AFTER_OFFLINE = new HttpContextToken<boolean>(() => false);
