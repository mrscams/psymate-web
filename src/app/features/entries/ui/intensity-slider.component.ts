import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { INTENSITY_MAX, INTENSITY_MIN } from '../data/entry.model';

/** Délai pour taper « 1 » puis « 0 » et obtenir 10. */
const TEN_DELAY_MS = 900;

/**
 * Curseur d'intensité d'un ressenti (fiche 05 §4, contrat 0 à 10) : `role="slider"` avec
 * `aria-valuemin/max/now/valuetext`, pilotable au clavier (← → ↑ ↓ ±1, Page ±2, Début / Fin, et
 * les chiffres : « 8 » donne 8, « 1 » puis « 0 » donne 10) et au pointeur. Sans valeur tant qu'on
 * ne l'a pas réglé (le serveur exige l'intensité : REQUIRED). Lavande réservée au ressenti.
 */
@Component({
  selector: 'pm-intensity-slider',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IntensitySliderComponent),
      multi: true,
    },
  ],
  template: `
    <div class="row">
      <div
        class="slider"
        role="slider"
        [attr.id]="sliderId()"
        [attr.tabindex]="disabled() ? -1 : 0"
        [attr.aria-labelledby]="labelledBy()"
        [attr.aria-describedby]="describedBy() || null"
        [attr.aria-valuemin]="min"
        [attr.aria-valuemax]="max"
        [attr.aria-valuenow]="value()"
        [attr.aria-valuetext]="valueText()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        (keydown)="onKey($event)"
        (pointerdown)="onPointer($event)"
        (blur)="onTouched()"
      >
        <span class="track" aria-hidden="true">
          <span class="fill" [style.width.%]="percent()"></span>
          @if (value() !== null) {
            <span class="thumb" [style.left.%]="percent()"></span>
          }
        </span>
      </div>
      <span class="value" aria-hidden="true">{{ display() }}</span>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .slider {
      flex: 1;
      display: flex;
      align-items: center;
      min-height: 44px;
      padding: 0 10px;
      border-radius: 10px;
      cursor: pointer;
      touch-action: none;
    }
    .slider:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .slider[aria-invalid='true'] .track {
      outline: 1px solid var(--danger);
      outline-offset: 4px;
    }
    .track {
      position: relative;
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: var(--surface-sunken);
    }
    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: 3px;
      background: var(--feeling);
    }
    .thumb {
      position: absolute;
      top: 50%;
      width: 18px;
      height: 18px;
      border: 2px solid var(--surface-raised);
      border-radius: 50%;
      background: var(--feeling-text);
      transform: translate(-50%, -50%);
    }
    .value {
      min-width: 5ch;
      font-family: var(--font-mono);
      font-size: 15px;
      color: var(--feeling-text);
      text-align: right;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntensitySliderComponent implements ControlValueAccessor {
  readonly sliderId = input<string>();
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string>();
  readonly invalid = input(false);

  protected readonly min = INTENSITY_MIN;
  protected readonly max = INTENSITY_MAX;
  protected readonly value = signal<number | null>(null);
  protected readonly disabled = signal(false);

  protected readonly percent = computed(() => {
    const value = this.value();
    return value === null ? 0 : ((value - this.min) / (this.max - this.min)) * 100;
  });
  protected readonly display = computed(() => {
    const value = this.value();
    return value === null ? `–/${this.max}` : `${value}/${this.max}`;
  });
  protected readonly valueText = computed(() => {
    const value = this.value();
    const max = this.max;
    return value === null
      ? $localize`:Valeur lue du curseur d'intensité non réglé@@entries.intensity.unset:Non renseignée`
      : $localize`:Valeur lue du curseur d'intensité@@entries.intensity.valueText:${value}:value: sur ${max}:max:`;
  });

  private onChange: (value: number | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;
  private lastDigit: { digit: number; at: number } | null = null;

  protected onKey(event: KeyboardEvent): void {
    if (this.disabled() || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = this.value();
    const base = current ?? this.min;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current === null ? this.min : base + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = base - 1;
        break;
      case 'PageUp':
        next = base + 2;
        break;
      case 'PageDown':
        next = base - 2;
        break;
      case 'Home':
        next = this.min;
        break;
      case 'End':
        next = this.max;
        break;
      default:
        if (/^\d$/.test(event.key)) next = this.fromDigit(Number(event.key));
    }
    if (next === null) return;
    event.preventDefault();
    this.set(next);
  }

  protected onPointer(event: PointerEvent): void {
    if (this.disabled()) return;
    const track = (event.currentTarget as HTMLElement).querySelector('.track');
    const box = track?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = (event.clientX - box.left) / box.width;
    this.set(Math.round(this.min + ratio * (this.max - this.min)));
  }

  private fromDigit(digit: number): number {
    const now = Date.now();
    const previous = this.lastDigit;
    this.lastDigit = { digit, at: now };
    if (digit === 0 && previous?.digit === 1 && now - previous.at < TEN_DELAY_MS) return 10;
    return digit;
  }

  private set(value: number): void {
    const clamped = Math.min(this.max, Math.max(this.min, value));
    if (clamped === this.value()) return;
    this.value.set(clamped);
    this.onChange(clamped);
  }

  writeValue(value: number | null): void {
    this.value.set(typeof value === 'number' ? value : null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
