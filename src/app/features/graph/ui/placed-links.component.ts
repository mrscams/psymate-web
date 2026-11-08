import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { uniqueId } from '../../../shared/util';
import { LinkActionProblem, PlacedLink } from '../data/link-editor.store';
import { LinkTypeCode, TypeAvailability } from '../data/link.model';
import { linkActionProblemText } from './link-labels';
import { LinkTypeChipsComponent } from './link-type-chips.component';

/**
 * « Liens déjà posés sur cette entrée » (fiche 06) : la phrase de chaque lien vue depuis l'entrée,
 * sa justification, « Modifier le type » (puces des types permis pour ce couple, PATCH) et
 * « Retirer » (DELETE : le lien passe superseded et reste ici, barré et marqué « retiré »).
 */
@Component({
  selector: 'pm-placed-links',
  imports: [LinkTypeChipsComponent],
  template: `
    <ul class="links">
      @for (link of items(); track link.id) {
        <li [class.removed]="link.removed" [attr.data-link-id]="link.id">
          <p class="sentence" [id]="link.sentenceId">
            @if (link.removed) {
              <s>{{ link.sentence }}</s>
              &ngsp;<span class="badge" i18n="Marque d'un lien retiré@@links.placed.removedBadge"
                >retiré</span
              >
            } @else {
              {{ link.sentence }}
            }
          </p>
          @if (link.rationale) {
            <p class="rationale">{{ link.rationale }}</p>
          }
          @if (!link.removed) {
            <div class="actions">
              <button
                type="button"
                class="text"
                [attr.aria-expanded]="editingId() === link.id"
                [attr.aria-describedby]="link.sentenceId"
                [disabled]="busyId() !== null"
                (click)="editingId() === link.id ? cancelEdit.emit() : edit.emit(link.id)"
                i18n="Bouton de modification du type d'un lien@@links.placed.edit"
              >
                Modifier le type
              </button>
              <button
                type="button"
                class="text danger"
                [attr.aria-describedby]="link.sentenceId"
                [disabled]="busyId() !== null"
                (click)="remove.emit(link.id)"
                i18n="Bouton de retrait d'un lien@@links.placed.remove"
              >
                Retirer
              </button>
            </div>
            @if (editingId() === link.id) {
              <div class="edit">
                @if (editAvailability(); as availability) {
                  <pm-link-type-chips
                    [label]="editLabel"
                    [availability]="availability"
                    [value]="link.linkType"
                    [disabled]="busyId() !== null"
                    (chosen)="choose(link.id, link.linkType, $event)"
                  />
                } @else if (editError()) {
                  <p class="error" role="alert">
                    <span i18n="Types possibles illisibles@@links.placed.typesError"
                      >Impossible de lire les types possibles.</span
                    >
                    &ngsp;<button
                      type="button"
                      class="text"
                      (click)="retryEdit.emit(link.id)"
                      i18n="Bouton de l'état erreur@@state.error.retry"
                    >
                      Réessayer
                    </button>
                  </p>
                } @else {
                  <p
                    class="hint"
                    role="status"
                    i18n="Types en cours de lecture@@links.placed.loadingTypes"
                  >
                    Lecture des types possibles…
                  </p>
                }
              </div>
            }
          }
          @if (problem()?.linkId === link.id) {
            <p class="error" role="alert">{{ problemText() }}</p>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: 8px 10px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--surface-raised);
    }
    li.removed {
      background: var(--surface-sunken);
    }
    .sentence {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--text-primary);
    }
    .removed .sentence {
      color: var(--text-secondary);
    }
    .rationale {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .badge {
      padding: 1px 6px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      font: var(--mat-sys-label-small);
      color: var(--text-secondary);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 4px;
    }
    .text {
      min-height: 32px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .text.danger {
      color: var(--danger);
    }
    .text:disabled {
      color: var(--text-secondary);
      cursor: default;
    }
    .text:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .edit {
      margin-top: 8px;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .error {
      margin: 6px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacedLinksComponent {
  readonly links = input.required<readonly PlacedLink[]>();
  readonly editingId = input<string | null>(null);
  /** Puces du lien en modification ; null tant que le type de l'autre extrémité est lu. */
  readonly editAvailability = input<readonly TypeAvailability[] | null>(null);
  /** Le type de l'autre extrémité n'a pas pu être lu (GET /api/entries/{id}). */
  readonly editError = input(false);
  readonly busyId = input<string | null>(null);
  readonly problem = input<LinkActionProblem | null>(null);

  readonly edit = output<string>();
  readonly cancelEdit = output<void>();
  readonly retryEdit = output<string>();
  readonly changeType = output<{ linkId: string; linkType: LinkTypeCode }>();
  readonly remove = output<string>();

  private readonly prefix = uniqueId('pm-placed-link');
  protected readonly editLabel = $localize`:Nom du groupe des types d'un lien posé@@links.placed.editGroup:Nouveau type`;

  protected readonly items = computed(() =>
    this.links().map((link) => ({ ...link, sentenceId: `${this.prefix}-${link.id}` })),
  );

  protected readonly problemText = computed(() => {
    const problem = this.problem();
    return problem ? linkActionProblemText(problem.problem) : '';
  });

  protected choose(linkId: string, current: LinkTypeCode, linkType: LinkTypeCode): void {
    if (linkType === current) return;
    this.changeType.emit({ linkId, linkType });
  }
}
