import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';

// Zoneless : c'est le mode par défaut depuis Angular 21 (angular.dev/guide/zoneless) ; zone.js
// n'est ni installé ni chargé, et provideZoneChangeDetection() ne doit jamais apparaître ici.
// HttpClient et les intercepteurs (core/http) arrivent avec M0-07.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
  ],
};
