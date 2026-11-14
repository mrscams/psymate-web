import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, uniqueId } from '../../../shared/util';

/**
 * Une section de la vue d'ensemble (UX-S6, proposition 02) : un titre et un filet, pas de boîte.
 * - `main` (colonne de lecture, `.sect-head`) : titre 15/650 en casse de phrase, compteur
 *   secondaire (`[sectCount]`), lien poussé à droite (`[sectLink]`) ;
 * - `side` (colonne latérale, `.side h3`) : titre 13/650 secondaire, compteur collé au titre.
 * À la place du contenu, l'un des trois états (shared/ui/state) : squelette au chargement, phrase
 * « apparaîtra ici quand… » s'il est vide, erreur avec « Réessayer » (les autres sections restent
 * lisibles). Pendant une relecture : `aria-busy` et la mention « mise à jour… ».
 */
@Component({
  selector: 'pm-overview-section',
  imports: [StateComponent],
  template: `
    <section
      [class]="variant()"
      [attr.aria-labelledby]="headingId"
      [attr.aria-busy]="refreshing() || null"
    >
      <header class="head">
        <h3 [id]="headingId">{{ heading() }}<ng-content select="[sectTitleCount]" /></h3>
        <span class="count"><ng-content select="[sectCount]" /></span>
        @if (refreshing()) {
          <!-- Indicateur visuel ; le pied de page (role=status) l'annonce une seule fois. -->
          <span
            class="busy"
            aria-hidden="true"
            i18n="Bloc en cours de relecture@@overview.block.busy"
            >mise à jour…</span
          >
        }
        <span class="link"><ng-content select="[sectLink]" /></span>
      </header>
      @if (state(); as kind) {
        <pm-state
          compact
          [kind]="kind"
          skeleton="block"
          [lines]="lines()"
          [title]="kind === 'empty' ? emptyTitle() : errorTitle()"
          [message]="kind === 'empty' ? emptyMessage() : undefined"
          [action]="kind === 'error' ? retryAction : undefined"
        />
      } @else {
        <ng-content />
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
    }
    h3 {
      margin: 0;
      color: var(--text-primary);
    }
    .main .head {
      margin-bottom: 10px;
    }
    .main h3 {
      font-size: 15px;
      line-height: 1.4;
      font-weight: 650;
    }
    .count,
    .busy {
      color: var(--text-secondary);
      font-size: 13px;
    }
    .count:empty {
      display: none;
    }
    .link {
      margin-left: auto;
      font-size: 13px;
    }
    .link:empty {
      display: none;
    }
    .side .head {
      margin-bottom: 8px;
    }
    .side h3 {
      font-size: 13px;
      line-height: 1.4;
      font-weight: 650;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSectionComponent {
  readonly heading = input.required<string>();
  /** null : le contenu ; sinon l'état à sa place. */
  readonly state = input.required<StateKind | null>();
  readonly emptyTitle = input.required<string>();
  readonly emptyMessage = input<string>();
  /** Titre de l'erreur (« Séances indisponibles »). */
  readonly errorTitle = input.required<string>();
  /** Relecture en cours, le contenu précédent reste affiché. */
  readonly refreshing = input(false);
  readonly lines = input(3);
  /** Colonne de lecture (`.sect-head`) ou colonne latérale (`.side h3`). */
  readonly variant = input<'main' | 'side'>('main');
  readonly retry = output<void>();

  protected readonly headingId = uniqueId('overview-section');
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton d'un bloc en erreur@@overview.block.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
}
