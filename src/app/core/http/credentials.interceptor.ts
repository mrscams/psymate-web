import { HttpInterceptorFn } from '@angular/common/http';

/** Préfixe des appels à psymate-api (même origine : proxy en dev, même domaine en production). */
export const API_PREFIX = '/api/';

export const JSON_ACCEPT = 'application/json, application/problem+json';

/**
 * Session par cookie HttpOnly, aucun jeton (handbook §6.3, G Q6) : chaque appel à l'API part avec
 * withCredentials.
 *
 * Accept : le contrat déclare la plupart des succès en « *\/* » (springdoc), si bien que le client
 * généré choisit « application/problem+json » comme seul type accepté, même pour lire un 200. Pour
 * une réponse JSON, on annonce les deux types ; les téléchargements (blob, texte) gardent le leur.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX)) return next(req);
  return next(
    req.clone({
      withCredentials: true,
      ...(req.responseType === 'json' ? { setHeaders: { Accept: JSON_ACCEPT } } : {}),
    }),
  );
};
