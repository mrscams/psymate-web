import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';

import { authRedirectInterceptor } from './auth-redirect.interceptor';
import { credentialsInterceptor } from './credentials.interceptor';
import { offlineInterceptor } from './offline.interceptor';
import { problemInterceptor } from './problem.interceptor';
import { retryAfterInterceptor } from './retry-after.interceptor';

export type { ApiProblem, FieldProblem } from './api-problem';
export { asProblem, isApiProblem } from './api-problem';
export { SKIP_AUTH_REDIRECT } from './http-context';
export type { HttpNotice, RateLimitedNotice, ReconnectedNotice } from './http-notices';
export { HttpNotices } from './http-notices';
export { MAX_AUTO_REPLAY_SECONDS } from './retry-after.interceptor';

/**
 * HttpClient et ses intercepteurs, dans l'ordre de la requête (le retour remonte la liste) :
 * credentials (cookie, Accept) → auth-redirect (401, 403 d'état) → retry-after (429) →
 * offline (statut 0) → problem (erreur → ApiProblem). Un rejeu (429, retour du réseau) repasse
 * par offline et problem.
 */
export function provideHttpLayer(): EnvironmentProviders {
  return provideHttpClient(
    withInterceptors([
      credentialsInterceptor,
      authRedirectInterceptor,
      retryAfterInterceptor,
      offlineInterceptor,
      problemInterceptor,
    ]),
  );
}
