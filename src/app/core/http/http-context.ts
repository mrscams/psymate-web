import { HttpContextToken } from '@angular/common/http';

/**
 * Posé sur une requête dont le 401 est attendu et traité par l'appelant (GET /api/auth/me au
 * démarrage) : auth-redirect.interceptor ne redirige pas vers /connexion.
 */
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);
