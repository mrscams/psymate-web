import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';

import { PUBLIC_PATHS } from '../../../shared/ui';
import { PublicMeta } from './page-meta';

/**
 * /mentions-legales (pied public, fiche 00 §4 ; UX-A6) : page statique, sans appel à l'API.
 * Contenu provisoire : l'éditeur et l'hébergeur restent à fournir par le propriétaire, rien n'est
 * inventé. Non indexée tant que le texte définitif n'est pas posé.
 */
@Component({
  selector: 'pm-legal-notice-page',
  templateUrl: './legal-notice.page.html',
  styleUrl: './info-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalNoticePage {
  constructor() {
    inject(PublicMeta).apply(
      {
        description: $localize`:Description des mentions légales pour les moteurs de recherche@@public.legal.meta.description:Mentions légales de PsyMate : éditeur et hébergement du site.`,
        robots: 'noindex,follow',
        canonicalPath: PUBLIC_PATHS.legal,
      },
      inject(DestroyRef),
    );
  }
}
