import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Une ligne de réglage de la fiche 14 : libellé, aide, et le contrôle projeté à droite. Les ids
 * `<id>-label` et `<id>-help` servent au contrôle (`aria-labelledby`, `aria-describedby`).
 */
@Component({
  selector: 'pm-setting-row',
  template: `
    <div class="text">
      <span class="label" [id]="labelId()">{{ label() }}</span>
      @if (help(); as help) {
        <span class="help" [id]="helpId()">{{ help }}</span>
      }
    </div>
    <div class="control">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .label {
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      font-weight: 500;
    }
    .help {
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .control {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingRowComponent {
  /** Préfixe des ids (« overview-window »). */
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly help = input<string>();

  protected readonly labelId = computed(() => `${this.id()}-label`);
  protected readonly helpId = computed(() => `${this.id()}-help`);
}
