import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { StateKind } from '../../util';

/** Action unique d'un état (planche 29 : « jamais plus d'une action primaire »). */
export interface StateAction {
  label: string;
  /** Touche affichée à côté du libellé (« N »). */
  shortcut?: string;
  handler: () => void;
}

/** Forme du squelette : ligne de tableau, carte de timeline, bloc de vue d'ensemble, fiche. */
export type SkeletonVariant = 'row' | 'card' | 'block' | 'profile';

/**
 * Le composant « état » (fiche 00 §7, planche 29) : vide, chargement ou erreur, à la taille du bloc
 * qu'il remplace. `kind` null ne rend rien, pour écrire `<pm-state [kind]="stateKind(loadable)" />`
 * à côté du contenu. Chargement : `aria-busy`, « Chargement… » lu une fois, squelettes `aria-hidden`
 * sans animation obligatoire. Vide : `role="status"`. Erreur : `role="alert"`, « Réessayer », détail
 * technique repliable.
 */
@Component({
  selector: 'pm-state',
  imports: [MatButtonModule],
  templateUrl: './state.component.html',
  styleUrl: './state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateComponent {
  readonly kind = input.required<StateKind | null>();
  readonly title = input<string>();
  readonly message = input<string>();
  readonly action = input<StateAction>();
  /** Texte technique (code, statut), affiché replié en erreur seulement. */
  readonly details = input<string>();
  readonly skeleton = input<SkeletonVariant>('block');
  /** Nombre de lignes ou de cartes du squelette. */
  readonly lines = input(3);
  /** Version compacte (cellule, carte) : illustration réduite, marges serrées. */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly rows = computed(() => Array.from({ length: Math.max(1, this.lines()) }));

  protected readonly heading = computed(() => {
    const title = this.title();
    if (title) return title;
    switch (this.kind()) {
      case 'error':
        return $localize`:Titre par défaut de l'état erreur@@state.error.title:Impossible de charger ce bloc`;
      case 'empty':
        return $localize`:Titre par défaut de l'état vide@@state.empty.title:Rien à afficher pour le moment`;
      default:
        return '';
    }
  });

  protected readonly text = computed(() => {
    const message = this.message();
    if (message !== undefined) return message;
    return this.kind() === 'error'
      ? $localize`:Phrase par défaut de l'état erreur@@state.error.message:Le serveur n'a pas répondu. Rien n'a été modifié.`
      : '';
  });

  protected readonly retryLabel = computed(
    () => this.action()?.label ?? $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
  );

  protected readonly loadingLabel = $localize`:Texte lu par le lecteur d'écran pendant un chargement@@state.loading:Chargement…`;
  protected readonly detailsLabel = $localize`:Résumé repliable du détail technique@@state.error.details:Détail technique`;
}
