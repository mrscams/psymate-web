#!/usr/bin/env node
// Utilisé par playwright.config.ts quand psymate-api ne répond pas encore sur /actuator/health :
// Playwright n'a pas à démarrer l'API (autre dépôt), il l'attend. Ce processus ne fait qu'expliquer
// quoi lancer, puis reste en vie pendant que Playwright interroge l'URL jusqu'à son délai.
console.error(
  [
    "[e2e] En attente de psymate-api sur http://localhost:8080/actuator/health (jusqu'à 2 min).",
    '[e2e] Dans ../psymate-api : make up && make run, puis make seed SIZE=small (profil local).',
  ].join('\n'),
);
setInterval(() => {}, 60_000);
