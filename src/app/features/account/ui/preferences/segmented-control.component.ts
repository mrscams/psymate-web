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
    /* Jamais plus large que sa colonne (375 px, UX-C1) : les libellés longs passent à la ligne
       dans leur segment plutôt que de faire défiler la page. */
    :host {
      display: inline-block;
      max-width: 100%;
    }
    .segments {
      display: inline-flex;
      max-width: 100%;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
      background: var(--surface-raised);
    }
    button {
      /* Jamais plus étroit que son mot le plus long (aucun libellé rogné) ; au-delà, les segments
         passent sur une seconde rangée. */
      flex: 1 1 auto;
      min-width: min-content;
      min-height: 36px;
      padding: 4px 14px;
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
    /* Écran étroit : si les segments ne tiennent plus côte à côte, ils passent à la ligne. */
    @media (max-width: 600px) {
      .segments {
        flex-wrap: wrap;
      }
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
