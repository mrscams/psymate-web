import { EnvironmentProviders, inject, provideEnvironmentInitializer } from '@angular/core';

import { PreferencesStore } from './preferences.store';

/**
 * Instancie le PreferencesStore au démarrage : il lit le cache local, applique thème et
 * vocabulaire, puis se charge dès que SessionStore connaît un praticien connecté. Rien n'attend
 * le réseau : l'application démarre même sans cache ou avec un cache corrompu.
 */
export function providePreferences(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    inject(PreferencesStore);
  });
}
