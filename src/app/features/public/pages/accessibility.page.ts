import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';

import { PUBLIC_PATHS } from '../../../shared/ui';
import { PublicMeta } from './page-meta';

/**
 * /accessibilite (pied public, fiche 00 §4 ; UX-A6) : page statique, sans appel à l'API. Elle
 * donne l'objectif du projet (B-ux : WCAG 2.1 AA) et ce qui est vérifié aujourd'hui, sans déclarer
 * de conformité : aucun audit n'a eu lieu. Le contact reste à fournir par le propriétaire
 * (l'application n'a pas d'adresse de contact générique). Non indexée tant que le texte définitif
 * n'est pas posé.
 */
@Component({
  selector: 'pm-accessibility-page',
  templateUrl: './accessibility.page.html',
  styleUrl: './info-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessibilityPage {
  constructor() {
    inject(PublicMeta).apply(
      {
        description: $localize`:Description de la page accessibilité pour les moteurs de recherche@@public.accessibility.meta.description:Accessibilité de PsyMate : objectif, vérifications en place et moyen de signaler un problème.`,
        robots: 'noindex,follow',
        canonicalPath: PUBLIC_PATHS.accessibility,
      },
      inject(DestroyRef),
    );
  }
}
