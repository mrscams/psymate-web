/// <reference types="@angular/localize" />

import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { serverConfig } from './app/app.config.server';

/**
 * Point d'entrée du rendu côté serveur, utilisé seulement au build pour prérendre les pages
 * publiques (angular.json, outputMode static ; app.routes.server.ts). Aucun serveur Node en production.
 */
const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, serverConfig, context);

export default bootstrap;
