import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideApiClient, provideSessionInitializer } from './core/auth';
import { provideHttpLayer } from './core/http';
import { providePreferences } from './core/preferences';

// Zoneless : c'est le mode par défaut depuis Angular 21 (angular.dev/guide/zoneless) ; zone.js
// n'est ni installé ni chargé, et provideZoneChangeDetection() ne doit jamais apparaître ici.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpLayer(),
    provideApiClient(),
    provideSessionInitializer(),
    providePreferences(),
  ],
};
