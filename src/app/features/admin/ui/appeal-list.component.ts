import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { Appeal, AppealOutcome } from '../data/admin.model';
import { decisionLabel, formatDay } from './admin-labels';

/**
 * Recours ouverts (G Q28) : nom, décision contestée, date de dépôt, message du praticien, puis
 * « Accepter… » (le compte est réactivé) ou « Écarter… » ; la page ouvre la boîte à motif.
 */
@Component({
  selector: 'pm-appeal-list',
  template: `
    <ul>
      @for (appeal of rows(); track appeal.id) {
        <li>
          <div class="head">
            <span class="name">{{ appeal.practitionerDisplayName }}</span>
            <span class="context">{{ appeal.context }}</span>
          </div>
          <blockquote>{{ appeal.message }}</blockquote>
          <div class="actions">
            <button
              type="button"
              class="accept"
              (click)="decide.emit({ appeal, outcome: 'accepted' })"
            >
              <span i18n="Bouton d'acceptation d'un recours@@admin.appeals.accept">Accepter…</span>
              <span class="sr-only">{{ appeal.practitionerDisplayName }}</span>
            </button>
            <button
              type="button"
              class="dismiss"
              (click)="decide.emit({ appeal, outcome: 'dismissed' })"
            >
              <span i18n="Bouton de rejet d'un recours@@admin.appeals.dismiss">Écarter…</span>
              <span class="sr-only">{{ appeal.practitionerDisplayName }}</span>
            </button>
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: baseline;
    }

    .name {
      font: var(--mat-sys-title-small);
    }

    .context {
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }

    blockquote {
      margin: 0;
      padding-left: 12px;
      border-left: 3px solid var(--border-strong);
      font: var(--mat-sys-body-medium);
      white-space: pre-line;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    button {
      min-height: 32px;
      padding: 0 10px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }

    .accept {
      border-color: var(--success);
      color: var(--success);
    }

    .dismiss {
      border-color: var(--danger);
      color: var(--danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppealListComponent {
  readonly appeals = input.required<Appeal[]>();
  readonly decide = output<{ appeal: Appeal; outcome: AppealOutcome }>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = computed(() =>
    this.appeals().map((appeal) => {
      const when = formatDay(appeal.submittedAt, this.locale);
      const contested = decisionLabel(appeal.decisionKind);
      return {
        ...appeal,
        context: $localize`:Contexte d'un recours@@admin.appeals.context:${contested}:decision: contesté · déposé le ${when}:date:`,
      };
    }),
  );
}
