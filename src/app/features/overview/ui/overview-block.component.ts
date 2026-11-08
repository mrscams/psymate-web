import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { StateAction, StateComponent } from '../../../shared/ui';
import { StateKind, uniqueId } from '../../../shared/util';

/**
 * Un bloc de la vue d'ensemble (B4 écran 2) : titre toujours visible, et l'un des trois états
 * (shared/ui/state) à la place du contenu : squelette au chargement, phrase « apparaîtra ici
 * quand… » s'il est vide, erreur avec « Réessayer » (les autres blocs restent lisibles). Le contenu
 * (projeté) ne s'affiche que hors de ces états ; `[blockMeta]` reste à droite du titre. Pendant
 * une relecture : `aria-busy` et la mention « mise à jour… », le texte garde son contraste.
 */
@Component({
  selector: 'pm-overview-block',
  imports: [StateComponent],
  template: `
    <section
      class="block"
      [attr.aria-labelledby]="headingId"
      [attr.aria-busy]="refreshing() || null"
    >
      <header class="head">
        <h3 [id]="headingId">{{ heading() }}</h3>
        @if (refreshing()) {
          <!-- Indicateur visuel ; le pied de page (role=status) l'annonce une seule fois. -->
          <span
            class="busy"
            aria-hidden="true"
            i18n="Bloc en cours de relecture@@overview.block.busy"
            >mise à jour…</span
          >
        }
        <ng-content select="[blockMeta]" />
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
    .block {
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
    }
    .busy {
      font: var(--mat-sys-label-small);
      color: var(--text-secondary);
    }
    .head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    h3 {
      flex: 1 1 auto;
      margin: 0;
      font: var(--mat-sys-label-medium);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewBlockComponent {
  readonly heading = input.required<string>();
  /** null : le contenu ; sinon l'état à sa place. */
  readonly state = input.required<StateKind | null>();
  readonly emptyTitle = input.required<string>();
  readonly emptyMessage = input<string>();
  /** Titre de l'erreur (« Tendance indisponible »). */
  readonly errorTitle = input.required<string>();
  /** Relecture en cours, le contenu précédent reste affiché (grisé). */
  readonly refreshing = input(false);
  readonly lines = input(3);
  readonly retry = output<void>();

  protected readonly headingId = uniqueId('overview-block');
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton d'un bloc en erreur@@overview.block.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
}
