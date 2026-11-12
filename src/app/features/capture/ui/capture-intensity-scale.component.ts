import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { INTENSITY_MAX, INTENSITY_MIN } from '../parser/parse.types';

/** Délai pour taper « 1 » puis « 0 » et obtenir 10. */
const TEN_DELAY_MS = 900;

/**
 * Échelle d'intensité du bloc de saisie (UX-S1, maquette 04b « .scale.lg ») : dix cases cliquables
 * de 1 à 10 en teinte ressenti, la valeur en JetBrains Mono à droite (« 7/10 »). Un seul élément
 * focalisable, `role="slider"` de 0 à 10 (bornes du contrat) : ← → ↑ ↓ ±1, Début / Fin, et les
 * chiffres (« 8 » donne 8, « 1 » puis « 0 » donne 10). Sans valeur : « non renseignée », aucune
 * case allumée. Lavande réservée au ressenti.
 */
@Component({
  selector: 'pm-capture-scale',
  template: `
    <div
      class="scale"
      role="slider"
      tabindex="0"
      [attr.id]="sliderId()"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-valuemin]="min"
      [attr.aria-valuemax]="max"
      [attr.aria-valuenow]="value() ?? min"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      (keydown)="onKey($event)"
    >
      @for (cell of cells; track cell) {
        <i
          class="cell"
          [class.on]="(value() ?? 0) >= cell"
          [attr.data-value]="cell"
          (pointerdown)="pick($event, cell)"
        ></i>
      }
    </div>
    <span class="value" aria-hidden="true">
      @if (value() === null) {
        <span class="unset">—</span>
      } @else {
        <b>{{ value() }}</b
        ><span class="max">/{{ max }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .scale {
      display: inline-flex;
      gap: 3px;
      padding: 4px;
      border-radius: 6px;
      cursor: pointer;
      touch-action: none;
    }
    .scale:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px var(--primary-tint);
    }
    .scale[aria-invalid='true'] {
      outline: 1px solid var(--warning);
      outline-offset: 2px;
    }
    .cell {
      display: block;
      width: 14px;
      height: 16px;
      border-radius: 3px;
      background: var(--border-subtle);
    }
    .cell.on {
      background: var(--feeling);
    }
    .value {
      font-family: var(--font-mono);
      font-size: 14px;
      color: var(--text-primary);
    }
    .value b {
      font-weight: 600;
      color: var(--feeling-text);
    }
    .max,
    .unset {
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureIntensityScaleComponent {
  readonly value = input<number | null>(null);
  readonly sliderId = input<string>();
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);

  readonly changed = output<number>();

  protected readonly min = INTENSITY_MIN;
  protected readonly max = INTENSITY_MAX;
  protected readonly cells = Array.from({ length: INTENSITY_MAX }, (_, i) => i + 1);

  protected readonly valueText = computed(() => {
    const value = this.value();
    const max = this.max;
    return value === null
      ? $localize`:Valeur lue de l'échelle d'intensité non réglée@@capture.intensity.unset:Non renseignée`
      : $localize`:Valeur lue de l'échelle d'intensité@@capture.intensity.valueText:${value}:value: sur ${max}:max:`;
  });

  private lastDigit: { digit: number; at: number } | null = null;

  protected pick(event: PointerEvent, cell: number): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.parentElement?.focus();
    this.set(cell);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const current = this.value();
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = (current ?? 0) + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = (current ?? 1) - 1;
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
    this.changed.emit(clamped);
  }
}
