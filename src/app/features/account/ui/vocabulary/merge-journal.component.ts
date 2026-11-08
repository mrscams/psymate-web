import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { isUndoable, MergeJournalEntry } from '../../data/merge-journal';

export type UndoMergeFn = (mergeId: string) => void;

interface JournalRow {
  entry: MergeJournalEntry;
  state: 'undoable' | 'undone' | 'expired';
  mergedAt: string;
  until: string;
  undoneAt: string;
}

/**
 * Journal des fusions d'émotions (fiche 17, G Q8) : source → cible, ressentis déplacés
 * (affectedCount), date, et « Annuler la fusion » jusqu'à undoUntil ; puis « annulée le … » ou
 * « délai dépassé ». Le contrat ne liste pas les fusions : le journal montre celles faites depuis ce
 * navigateur (data/merge-journal.ts).
 */
@Component({
  selector: 'pm-merge-journal',
  imports: [MatButtonModule],
  template: `
    @if (rows().length === 0) {
      <p class="muted" i18n="Journal des fusions vide@@vocabulary.journal.empty">
        Aucune fusion faite depuis ce navigateur. Une fusion reste annulable pendant 30 jours.
      </p>
    } @else {
      <ul class="journal">
        @for (row of rows(); track row.entry.merge.id) {
          <li [attr.data-merge]="row.entry.merge.id">
            <div class="journal-text">
              <p class="journal-title">
                <span class="name">{{ row.entry.sourceLabel }}</span>
                <span aria-hidden="true"> → </span>
                <span
                  class="sr-only"
                  i18n="Mot entre source et cible d'une fusion@@vocabulary.journal.into"
                  >fusionnée dans</span
                >
                <span class="name">{{ row.entry.targetLabel }}</span>
              </p>
              <p class="muted">
                <span i18n="Ressentis déplacés et date d'une fusion@@vocabulary.journal.meta"
                  >{row.entry.merge.affectedCount, plural,
                    =0 {aucun ressenti}
                    =1 {1 ressenti}
                    other {{{row.entry.merge.affectedCount}} ressentis}
                  }
                  · le {{ row.mergedAt }}</span
                >
                @switch (row.state) {
                  @case ('undoable') {
                    <span i18n="Fusion annulable jusqu'à une date@@vocabulary.journal.until"
                      >· annulable jusqu'au {{ row.until }}</span
                    >
                  }
                  @case ('undone') {
                    <span class="state-undone" i18n="Fusion annulée@@vocabulary.journal.undone"
                      >· annulée le {{ row.undoneAt }}</span
                    >
                  }
                  @case ('expired') {
                    <span i18n="Fusion au délai dépassé@@vocabulary.journal.expired"
                      >· délai d'annulation dépassé</span
                    >
                  }
                }
              </p>
            </div>
            @if (row.state === 'undoable') {
              <button
                mat-stroked-button
                type="button"
                [disabled]="undoing() === row.entry.merge.id"
                (click)="undo()(row.entry.merge.id)"
              >
                <span i18n="Bouton annuler une fusion@@vocabulary.journal.undo"
                  >Annuler la fusion</span
                >
                <span class="sr-only"> {{ row.entry.sourceLabel }}</span>
              </button>
            }
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './vocabulary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MergeJournalComponent {
  readonly entries = input.required<readonly MergeJournalEntry[]>();
  readonly undoing = input<string | null>(null);
  readonly undo = input.required<UndoMergeFn>();
  /** Horloge injectable pour les tests. */
  readonly now = input<number | null>(null);

  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = computed<JournalRow[]>(() => {
    const now = this.now() ?? Date.now();
    const date = new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' });
    const format = (iso: string | null): string => {
      const time = iso ? Date.parse(iso) : NaN;
      return Number.isFinite(time) ? date.format(new Date(time)) : '';
    };
    return this.entries().map((entry) => ({
      entry,
      state: entry.merge.undoneAt ? 'undone' : isUndoable(entry, now) ? 'undoable' : 'expired',
      mergedAt: format(entry.merge.mergedAt),
      until: format(entry.merge.undoUntil),
      undoneAt: format(entry.merge.undoneAt),
    }));
  });
}
