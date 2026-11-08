import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { EntryIconComponent, EntryType } from '../../../shared/ui';
import { TypeCount } from '../data/search.model';
import { typeChipLabel } from './search-labels';

/**
 * Puces « Types » de la recherche (fiche 07) : « Tous » puis une par type, avec sa forme et son
 * compteur (countsByType, calculés sans le filtre de type : ils ne bougent pas quand on filtre).
 * Filtre exclusif : une puce à la fois, « Tous » réinitialise. Boutons à bascule (aria-pressed).
 */
@Component({
  selector: 'pm-search-type-chips',
  imports: [EntryIconComponent],
  template: `
    <div class="chips" role="group" [attr.aria-labelledby]="labelId">
      <span class="label" [id]="labelId" i18n="Étiquette des puces de type@@search.types.label"
        >Types</span
      >
      <button
        type="button"
        class="chip"
        [attr.aria-pressed]="selected() === null"
        (click)="choose(null)"
      >
        <span i18n="Puce de tous les types@@search.types.all">Tous</span>&ngsp;<span
          class="count"
          >{{ allCount() }}</span
        >
      </button>
      @for (item of counts(); track item.type) {
        <button
          type="button"
          class="chip"
          [class.zero]="item.count === 0"
          [attr.aria-pressed]="selected() === item.type"
          (click)="choose(item.type)"
        >
          <pm-entry-icon [type]="item.type" [size]="12" />
          <span>{{ label(item.type) }}</span
          >&ngsp;<span class="count">{{ item.count }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .label {
      margin-right: 4px;
      color: var(--text-secondary);
      font: var(--mat-sys-body-medium);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--border-strong);
    }
    .chip[aria-pressed='true'] {
      border-color: var(--primary);
      background: var(--primary-tint);
      color: var(--primary-hover);
      font-weight: 500;
    }
    .chip:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .count {
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .chip:not([aria-pressed='true']) .count,
    .chip.zero {
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypeChipsComponent {
  readonly counts = input.required<TypeCount[]>();
  readonly allCount = input.required<number>();
  readonly selected = input<EntryType | null>(null);
  readonly selectType = output<EntryType | null>();

  protected readonly labelId = 'search-types-label';
  protected readonly label = typeChipLabel;

  protected choose(type: EntryType | null): void {
    if (type !== this.selected()) this.selectType.emit(type);
  }
}
