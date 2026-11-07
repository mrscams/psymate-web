import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import { SessionStore } from './session.store';

/**
 * Au démarrage, GET /api/auth/me remplit le SessionStore avant la première navigation, pour que
 * les gardes sachent qui est là. Un 401 (pas de session) ou une panne ne bloque pas le démarrage :
 * SessionStore.load() ne rejette jamais.
 */
export function provideSessionInitializer(): EnvironmentProviders {
  return provideAppInitializer(() => inject(SessionStore).load());
}
