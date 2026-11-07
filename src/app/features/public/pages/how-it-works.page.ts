import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PUBLIC_FACTS } from '../public-facts';
import { PUBLIC_FEATURE_PATHS } from '../public-paths';
import { PublicMeta } from './page-meta';

/**
 * /comment-ca-marche (fiche 24) : page statique, indexable, prérendue en entier (lisible sans
 * JavaScript). Aucun appel à l'API. Ni agenda Google (G Q25) ni signalement (G Q26), ni numéro
 * d'urgence (G Q20).
 */
@Component({
  selector: 'pm-how-it-works-page',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './how-it-works.page.html',
  styleUrl: './how-it-works.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowItWorksPage {
  protected readonly paths = PUBLIC_FEATURE_PATHS;
  protected readonly facts = PUBLIC_FACTS;

  constructor() {
    inject(PublicMeta).apply(
      {
        description: $localize`:Description de comment ça marche pour les moteurs de recherche@@public.how.meta.description:PsyMate : un outil de suivi pour les psychologues, psychiatres et coachs, et un annuaire public de praticiens dont le dossier a été vérifié.`,
        robots: 'index,follow',
        canonicalPath: PUBLIC_FEATURE_PATHS.howItWorks,
      },
      inject(DestroyRef),
    );
  }
}
