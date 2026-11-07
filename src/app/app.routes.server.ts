import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Rendu par route (C10 M5-05) : seules les pages publiques sont prérendues au build, en HTML
 * statique indexable ; leurs données (annuaire, fiche) se chargent côté client après hydratation.
 * Aucune route authentifiée n'est rendue côté serveur : tout le reste est rendu dans le navigateur.
 *
 * /praticiens/:slug : la liste des fiches publiées n'est pas connue au build (le build ne dépend pas
 * de l'API) ; aucune adresse n'est prérendue, la fiche est rendue dans le navigateur avec ses
 * balises meta (fiche 09 : prérendu par fiche souhaitable en V1.1).
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'annuaire', renderMode: RenderMode.Prerender },
  { path: 'comment-ca-marche', renderMode: RenderMode.Prerender },
  {
    path: 'praticiens/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => [],
    fallback: PrerenderFallback.Client,
  },
  { path: '**', renderMode: RenderMode.Client },
];
