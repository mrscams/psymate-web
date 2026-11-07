import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Une option d'un contrôle segmenté : valeur de la préférence et libellé affiché. */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Contrôle segmenté de la fiche 14 : `role="group"` nommé, un bouton par option avec
 * `aria-pressed`. Choisir une option émet `valueChange` ; le parent enregistre et renvoie la valeur
 * (optimiste) par `value`.
 */
@Component({
  selector: 'pm-segmented-control',
  template: `
    <div
      class="segments"
      role="group"
      [attr.aria-label]="label()"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          [attr.aria-pressed]="option.value === value()"
          [class.pressed]="option.value === value()"
          [disabled]="disabled()"
          (click)="select(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .segments {
      display: inline-flex;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
      background: var(--surface-raised);
    }
    button {
      min-height: 36px;
      padding: 0 16px;
      border: 0;
      border-left: 1px solid var(--border-subtle);
      background: transparent;
      color: var(--text-secondary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    button:first-child {
      border-left: 0;
    }
    button.pressed {
      background: var(--primary-tint);
      color: var(--primary-hover);
      font-weight: 600;
    }
    button:focus-visible {
      outline-offset: -3px;
      box-shadow: none;
    }
    button[disabled] {
      cursor: default;
      color: var(--text-disabled);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedControlComponent<T extends string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = input.required<T>();
  /** Nom du groupe, ou `labelledBy` vers le libellé de la ligne. */
  readonly label = input<string>();
  readonly labelledBy = input<string>();
  readonly describedBy = input<string>();
  readonly disabled = input(false);

  readonly valueChange = output<T>();

  protected select(value: T): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }
}
