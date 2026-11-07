import { HttpBackend, HttpErrorResponse, HttpEvent, HttpRequest } from '@angular/common/http';
import { ApplicationConfig, Injectable, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { Observable, throwError } from 'rxjs';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Au prérendu (build), l'API n'est pas joignable et ne doit pas l'être : le HTML des pages publiques
 * ne contient aucune donnée de l'API ni de session. Toute requête échoue tout de suite en 503,
 * statut neutre pour les intercepteurs (ni redirection 401, ni bandeau hors ligne du statut 0, ni
 * rejeu 429) ; la session reste vide et les pages chargent leurs données dans le navigateur.
 */
@Injectable()
export class NoApiAtPrerender implements HttpBackend {
  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 503,
          statusText: 'Prerender',
          url: req.urlWithParams,
        }),
    );
  }
}

const serverOnly: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: HttpBackend, useClass: NoApiAtPrerender },
  ],
};

export const serverConfig = mergeApplicationConfig(appConfig, serverOnly);
