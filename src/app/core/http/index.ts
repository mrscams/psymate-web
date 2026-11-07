import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';

import { authRedirectInterceptor } from './auth-redirect.interceptor';
import { credentialsInterceptor } from './credentials.interceptor';
import { problemInterceptor } from './problem.interceptor';

export type { ApiProblem, FieldProblem } from './api-problem';
export { asProblem, isApiProblem } from './api-problem';
export { SKIP_AUTH_REDIRECT } from './http-context';

/**
 * HttpClient et ses intercepteurs, dans l'ordre de la requête (le retour remonte la liste) :
 * credentials (cookie, Accept) → auth-redirect (401, 403 d'état) → problem (erreur → ApiProblem).
 * retry-after (429) et offline (statut 0) s'ajoutent en M0-09.
 */
export function provideHttpLayer(): EnvironmentProviders {
  return provideHttpClient(
    withInterceptors([credentialsInterceptor, authRedirectInterceptor, problemInterceptor]),
  );
}
