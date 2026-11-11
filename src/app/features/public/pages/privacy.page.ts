import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';

import { PUBLIC_PATHS } from '../../../shared/ui';
import { PUBLIC_FACTS } from '../public-facts';
import { PublicMeta } from './page-meta';

/**
 * /confidentialite (pied public, fiche 00 §4 ; UX-A6) : page statique, sans appel à l'API.
 * Elle ne décrit que ce que l'application fait déjà (fiche 24, PUBLIC_FACTS) ; le responsable du
 * traitement, les bases légales et le contact restent à fournir par le propriétaire (G Q16 : étude
 * RGPD à venir). Non indexée tant que le texte définitif n'est pas posé.
 */
@Component({
  selector: 'pm-privacy-page',
  templateUrl: './privacy.page.html',
  styleUrl: './info-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  protected readonly facts = PUBLIC_FACTS;

  constructor() {
    inject(PublicMeta).apply(
      {
        description: $localize`:Description de la page confidentialité pour les moteurs de recherche@@public.privacy.meta.description:Confidentialité sur PsyMate : quelles données sont traitées et combien de temps elles sont gardées.`,
        robots: 'noindex,follow',
        canonicalPath: PUBLIC_PATHS.privacy,
      },
      inject(DestroyRef),
    );
  }
}
