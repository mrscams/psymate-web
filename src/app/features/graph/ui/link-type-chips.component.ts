import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { uniqueId } from '../../../shared/util';
import { LinkTypeCode, TypeAvailability } from '../data/link.model';
import { refusalText } from './link-labels';

/**
 * Les types de lien en puces (fiche 06, Relation) : `role="group"` nommé, un `<button aria-pressed>`
 * par type, dans l'ordre du catalogue. Les types que la matrice refuse pour le couple courant restent
 * visibles mais désactivés (`aria-disabled`, toujours atteignables au clavier) ; leur aide, sous les
 * puces, leur est reliée par `aria-describedby`.
 */
@Component({
  selector: 'pm-link-type-chips',
  template: `
    <div
      class="chips"
      role="group"
      [attr.aria-label]="label()"
      [attr.aria-describedby]="describedBy()"
    >
      @for (item of items(); track item.code) {
        <button
          type="button"
          class="chip"
          [attr.data-code]="item.code"
          [attr.aria-pressed]="value() === item.code"
          [attr.aria-disabled]="item.allowed && !disabled() ? null : 'true'"
          [attr.aria-describedby]="item.helpId"
          (click)="choose(item.code, item.allowed)"
        >
          {{ item.label }}
        </button>
      }
    </div>
    @if (refusals().length > 0) {
      <ul class="refusals">
        @for (item of refusals(); track item.code) {
          <li [id]="item.helpId">{{ item.help }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
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
      border-color: var(--primary);
      background: var(--primary-tint);
      color: var(--primary-hover);
    }
    .chip[aria-disabled='true'] {
      border-style: dashed;
      border-color: var(--border-subtle);
      color: var(--text-secondary);
      cursor: not-allowed;
    }
    .chip:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .refusals {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .refusals li + li {
      margin-top: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkTypeChipsComponent {
  readonly label = input.required<string>();
  readonly availability = input.required<readonly TypeAvailability[]>();
  readonly value = input<LinkTypeCode | null>(null);
  /** Toutes les puces inactives (enregistrement en cours). */
  readonly disabled = input(false);
  /** Message d'erreur du champ (422 sur linkType), relié au groupe. */
  readonly describedBy = input<string | null>(null);
  readonly chosen = output<LinkTypeCode>();

  private readonly prefix = uniqueId('pm-link-type');

  protected readonly items = computed(() =>
    this.availability().map((item) => ({
      code: item.type.code,
      label: item.type.label,
      allowed: item.allowed,
      helpId: item.reason ? `${this.prefix}-${item.type.code}` : null,
      help: item.reason ? refusalText(item.type, item.reason) : '',
    })),
  );

  protected readonly refusals = computed(() => this.items().filter((item) => !item.allowed));

  protected choose(code: LinkTypeCode, allowed: boolean): void {
    if (!allowed || this.disabled()) return;
    this.chosen.emit(code);
  }
}
