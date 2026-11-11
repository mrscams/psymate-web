import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { INTENSITY_MAX, INTENSITY_MIN, SLIDER_MIN } from '../data/entry.model';

/** Délai pour taper « 1 » puis « 0 » et obtenir 10. */
const TEN_DELAY_MS = 900;

/**
 * Curseur d'intensité d'un ressenti (fiche 05 §4) : gradué de 1 à 10, valeur en JetBrains Mono à
 * droite du libellé (projeté), repères 1 à 10 sous la piste. `role="slider"` avec
 * `aria-valuemin/max/now/valuetext`, pilotable au clavier (← → ↑ ↓ ±1, Page ±2, Début / Fin, et
 * les chiffres : « 8 » donne 8, « 1 » puis « 0 » donne 10) et au pointeur. Le panneau règle 5 à
 * l'ouverture d'un ressenti ; sans valeur (null), le curseur l'annonce « Non renseignée ». Une
 * intensité 0 venue de la barre de capture (le contrat va de 0 à 10) reste affichée telle quelle :
 * le minimum descend alors à 0. Lavande réservée au ressenti.
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
    <div class="head">
      <ng-content />
      <span class="value" aria-hidden="true"
        >{{ shown() }}<span class="max">/{{ max }}</span></span
      >
    </div>
    <div
      class="slider"
      role="slider"
      [attr.id]="sliderId()"
      [attr.tabindex]="disabled() ? -1 : 0"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max"
      [attr.aria-valuenow]="value() ?? min()"
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
    <div class="ticks" aria-hidden="true">
      @for (tick of ticks(); track tick.value) {
        <span class="tick" [class.on]="tick.value === value()" [style.left.%]="tick.left">{{
          tick.value
        }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .value {
      font-family: var(--font-mono);
      font-size: 15px;
      font-weight: 500;
      color: var(--feeling-text);
    }
    .max {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .slider {
      display: flex;
      align-items: center;
      height: 28px;
      padding: 0 8px;
      border-radius: 8px;
      cursor: pointer;
      touch-action: none;
    }
    .slider:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px var(--primary-tint);
    }
    .slider[aria-invalid='true'] .track {
      outline: 1px solid var(--danger);
      outline-offset: 4px;
    }
    .track {
      position: relative;
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: var(--border-subtle);
    }
    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: 2px;
      background: var(--feeling);
    }
    .thumb {
      position: absolute;
      top: 50%;
      box-sizing: border-box;
      width: 16px;
      height: 16px;
      border: 2.5px solid var(--feeling);
      border-radius: 50%;
      background: var(--surface-raised);
      box-shadow: 0 1px 3px var(--scrim);
      transform: translate(-50%, -50%);
    }
    .ticks {
      position: relative;
      height: 14px;
      margin: 0 8px;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 14px;
      color: var(--text-secondary);
    }
    .tick {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
    }
    .tick.on {
      font-weight: 600;
      color: var(--feeling-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntensitySliderComponent implements ControlValueAccessor {
  readonly sliderId = input<string>();
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string>();
  readonly invalid = input(false);

  protected readonly max = INTENSITY_MAX;
  protected readonly value = signal<number | null>(null);
  protected readonly disabled = signal(false);
  /** 1, sauf pour une intensité 0 reçue (contrat 0 à 10) : le curseur ne la travestit pas. */
  protected readonly min = computed(() =>
    this.value() === INTENSITY_MIN ? INTENSITY_MIN : SLIDER_MIN,
  );

  protected readonly ticks = computed(() => {
    const min = this.min();
    const span = this.max - min;
    return Array.from({ length: span + 1 }, (_, i) => ({
      value: min + i,
      left: (i / span) * 100,
    }));
  });

  protected readonly percent = computed(() => {
    const value = this.value();
    const min = this.min();
    return value === null ? 0 : ((value - min) / (this.max - min)) * 100;
  });
  protected readonly shown = computed(() => this.value() ?? '–');
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
    const base = current ?? SLIDER_MIN;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current === null ? SLIDER_MIN : base + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current === null ? SLIDER_MIN : base - 1;
        break;
      case 'PageUp':
        next = base + 2;
        break;
      case 'PageDown':
        next = base - 2;
        break;
      case 'Home':
        next = SLIDER_MIN;
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
    this.set(Math.round(SLIDER_MIN + ratio * (this.max - SLIDER_MIN)));
  }

  private fromDigit(digit: number): number {
    const now = Date.now();
    const previous = this.lastDigit;
    this.lastDigit = { digit, at: now };
    if (digit === 0 && previous?.digit === 1 && now - previous.at < TEN_DELAY_MS) return 10;
    return digit;
  }

  /** Toute saisie reste dans 1 à 10 (le 0 n'est jamais choisi depuis le curseur). */
  private set(value: number): void {
    const clamped = Math.min(this.max, Math.max(SLIDER_MIN, value));
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
