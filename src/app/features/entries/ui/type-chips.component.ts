import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { ENTRY_TYPES, EntryIconComponent, EntryType, entryTypeLabel } from '../../../shared/ui';

/**
 * Les six types d'entrée en puces (fiche 05 §3) : forme et couleur du type (pm-entry-icon), une seule
 * pressée (`role="group"` + `aria-pressed`). Une seule puce dans l'ordre de tabulation (celle du
 * type choisi) ; ← → passent au type voisin et le choisissent. Verrouillées en correction (le type
 * ne se modifie pas) : contrôle désactivé.
 */
@Component({
  selector: 'pm-type-chips',
  imports: [EntryIconComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TypeChipsComponent), multi: true },
  ],
  template: `
    <div class="chips" role="group" [attr.aria-label]="label()">
      @for (type of types; track type) {
        <button
          type="button"
          class="chip"
          [class.feeling]="type === 'feeling'"
          [attr.data-type]="type"
          [attr.aria-pressed]="value() === type"
          [attr.aria-disabled]="disabled() ? 'true' : null"
          [tabIndex]="!disabled() && value() === type ? 0 : -1"
          (click)="choose(type)"
          (keydown)="onKey($event, type)"
        >
          <pm-entry-icon [type]="type" [size]="14" />
          <span>{{ labelOf(type) }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .chip[aria-pressed='true'] {
      border-color: var(--primary-hover);
      background: var(--primary-tint);
      color: var(--primary-hover);
    }
    .chip.feeling[aria-pressed='true'] {
      border-color: var(--feeling-text);
      background: var(--feeling-tint);
      color: var(--feeling-text);
    }
    .chip[aria-disabled='true'] {
      cursor: default;
    }
    .chip[aria-disabled='true'][aria-pressed='false'] {
      color: var(--text-secondary);
    }
    .chip:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TypeChipsComponent implements ControlValueAccessor {
  readonly label = input.required<string>();

  protected readonly types = ENTRY_TYPES;
  protected readonly value = signal<EntryType>('note');
  protected readonly disabled = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: EntryType) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected labelOf(type: EntryType): string {
    return entryTypeLabel(type);
  }

  protected choose(type: EntryType): void {
    if (this.disabled() || type === this.value()) return;
    this.value.set(type);
    this.onChange(type);
    this.onTouched();
  }

  protected onKey(event: KeyboardEvent, type: EntryType): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step || this.disabled()) return;
    event.preventDefault();
    const index = this.types.indexOf(type);
    const next = this.types[(index + step + this.types.length) % this.types.length];
    this.choose(next);
    this.host.nativeElement.querySelector<HTMLElement>(`[data-type="${next}"]`)?.focus();
  }

  writeValue(value: EntryType | null): void {
    this.value.set(value ?? 'note');
  }

  registerOnChange(fn: (value: EntryType) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
