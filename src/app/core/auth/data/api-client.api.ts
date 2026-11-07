import { EnvironmentProviders } from '@angular/core';

import { provideApi } from '../../../api';

/**
 * Configuration du client généré : chemins relatifs (/api/…), même origine que l'application
 * (proxy /api → :8080 en dev, même domaine en production). Le cookie part grâce à
 * credentials.interceptor.
 */
export function provideApiClient(): EnvironmentProviders {
  return provideApi({ basePath: '', withCredentials: true });
}
