import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';

import { FieldProblem } from '../../core/http';
import { fieldId } from './apply-problem';

/**
 * Résumé d'un 422 en tête de formulaire (planche 29) : `role="alert"`, « N champs à corriger »,
 * un lien par champ vers son contrôle (id = fieldId(field)), puis les erreurs sans champ. Reçoit
 * le focus quand il apparaît ; le formulaire donne ensuite le focus au premier champ fautif.
 */
@Component({
  selector: 'pm-problem-summary',
  template: `
    @if (errors().length > 0) {
      <div class="summary" role="alert" tabindex="-1" #box>
        <p class="title">{{ title() }}</p>
        @if (linked().length > 0) {
          <ul>
            @for (error of linked(); track error.field) {
              <li>
                <a [href]="'#' + fieldId(error.field)">{{ labelOf(error.field) }}</a>
                <span class="message"> · {{ error.message }}</span>
              </li>
            }
          </ul>
        }
        @for (error of unlinked(); track $index) {
          <p class="message">{{ error.message }}</p>
        }
      </div>
    }
  `,
  styles: `
    .summary {
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--danger);
      background: var(--danger-bg);
      color: var(--danger);
    }
    .title {
      margin: 0;
      font: var(--mat-sys-title-small);
    }
    ul {
      margin: 8px 0 0;
      padding-left: 20px;
    }
    a {
      color: var(--danger);
      font-weight: 600;
    }
    .message {
      margin: 4px 0 0;
      color: var(--text-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProblemSummaryComponent {
  /** errors[] du problème (reliées ou non) ; vide ou null : rien n'est rendu. */
  readonly errors = input<FieldProblem[]>([]);
  /** Libellés des champs (`displayName` → « Nom affiché ») ; sinon le nom du champ. */
  readonly labels = input<Record<string, string>>({});
  /** Champs sans contrôle dans le formulaire : affichés en texte, sans lien. */
  readonly unmatched = input<string[]>([]);

  private readonly box = viewChild<ElementRef<HTMLElement>>('box');

  protected readonly fieldId = fieldId;

  protected readonly linked = computed(() =>
    this.errors().filter((error) => error.field && !this.unmatched().includes(error.field)),
  );
  protected readonly unlinked = computed(() =>
    this.errors().filter((error) => !error.field || this.unmatched().includes(error.field)),
  );

  protected readonly title = computed(() => {
    const count = this.errors().length;
    return count === 1
      ? $localize`:Résumé d'un 422, un seul champ@@forms.summary.titleOne:1 champ à corriger.`
      : $localize`:Résumé d'un 422, plusieurs champs@@forms.summary.titleMany:${count}:count: champs à corriger.`;
  });

  constructor() {
    effect(() => {
      if (this.errors().length > 0) this.box()?.nativeElement.focus();
    });
  }

  protected labelOf(field: string): string {
    return this.labels()[field] ?? field;
  }
}
