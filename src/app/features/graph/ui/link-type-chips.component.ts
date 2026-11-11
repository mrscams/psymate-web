import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { uniqueId } from '../../../shared/util';
import { LinkTypeCode, TypeAvailability } from '../data/link.model';
import { refusalText } from './link-labels';

/**
 * Les types de lien en puces (fiche 06, Relation) : `role="group"` nommé, un `<button aria-pressed>`
 * par type, dans l'ordre du catalogue. Les types que la matrice refuse pour le couple courant restent
 * visibles mais grisés (`text-disabled`, bordure `border-subtle`, UX-B7), `aria-disabled` (toujours
 * atteignables au clavier) ; leur raison est dans `title` et, pour les lecteurs d'écran, dans une
 * description reliée par `aria-describedby`. Une seule ligne d'aide visible sous les puces : celle de
 * la dernière puce refusée touchée (clic ou focus), comme la maquette 06.
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
          [attr.title]="item.help || null"
          (click)="choose(item.code, item.allowed)"
          (focus)="explain(item.code, item.allowed)"
        >
          {{ item.label }}
        </button>
      }
    </div>
    @for (item of refusals(); track item.code) {
      <span class="sr-only" [id]="item.helpId">{{ item.help }}</span>
    }
    @if (shownHelp(); as help) {
      <p class="hint">{{ help }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
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
      font-weight: 600;
    }
    .chip[aria-disabled='true'] {
      border-color: var(--border-subtle);
      background: var(--surface-raised);
      color: var(--text-disabled);
      cursor: not-allowed;
    }
    .chip:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .hint {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
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

  /** Puce refusée dont l'aide est montrée ; oubliée quand les types permis changent. */
  private readonly explained = linkedSignal<readonly TypeAvailability[], LinkTypeCode | null>({
    source: this.availability,
    computation: () => null,
  });

  protected readonly shownHelp = computed(() => {
    const code = this.explained();
    return code ? (this.refusals().find((item) => item.code === code)?.help ?? null) : null;
  });

  protected choose(code: LinkTypeCode, allowed: boolean): void {
    if (!allowed) {
      this.explained.set(code);
      return;
    }
    if (this.disabled()) return;
    this.chosen.emit(code);
  }

  protected explain(code: LinkTypeCode, allowed: boolean): void {
    this.explained.set(allowed ? null : code);
  }
}
