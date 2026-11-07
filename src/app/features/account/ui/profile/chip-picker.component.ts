import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Une valeur de la liste fermée, avec son libellé dans la langue de l'écran. */
export interface ChipOption {
  code: string;
  label: string;
}

let nextId = 0;

/**
 * Puces choisies dans une liste fermée (fiche 10, G Q15) : champ de filtre en combobox, liste des
 * valeurs non encore choisies ; `Entrée` ajoute l'option surlignée, `Retour arrière` sur champ vide
 * retire la dernière puce, chaque puce a son bouton « Retirer X ». Aucune valeur libre : seul un
 * code de `options` peut entrer dans la valeur. `max` borne le nombre de puces (8 spécialités).
 */
@Component({
  selector: 'pm-chip-picker',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ChipPickerComponent), multi: true },
  ],
  template: `
    <label class="label" [for]="inputId()">{{ label() }}</label>
    <div class="box" [class.disabled]="disabled()">
      @if (chips().length > 0) {
        <ul class="chips" [attr.aria-label]="selectedLabel()">
          @for (chip of chips(); track chip.code) {
            <li class="chip">
              <span>{{ chip.label }}</span>
              <button
                type="button"
                class="remove"
                [disabled]="disabled()"
                [attr.aria-label]="removeLabel(chip.label)"
                (click)="remove(chip.code); $event.stopPropagation()"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          }
        </ul>
      }
      <input
        #field
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [id]="inputId()"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeId()"
        [attr.aria-describedby]="describedBy()"
        [placeholder]="full() ? fullPlaceholder : placeholder()"
        [disabled]="disabled()"
        [readOnly]="full()"
        [attr.aria-disabled]="full() ? 'true' : null"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (focus)="open.set(true)"
        (blur)="onBlur()"
      />
    </div>
    <p class="hint" [id]="hintId">
      {{ hint() }}
      @if (max(); as limit) {
        <span class="count">{{ value().length }} / {{ limit }}</span>
      }
    </p>
    @if (expanded()) {
      <ul class="options" role="listbox" [id]="listId" [attr.aria-label]="label()">
        @for (option of filtered(); track option.code; let i = $index) {
          <li
            role="option"
            [id]="optionId(i)"
            [attr.aria-selected]="i === active()"
            [class.active]="i === active()"
            tabindex="-1"
            (mousedown)="$event.preventDefault()"
            (click)="add(option.code)"
            (keydown.enter)="add(option.code)"
          >
            {{ option.label }}
          </li>
        }
      </ul>
    }
    @if (open() && !disabled() && !full() && query().trim() !== '' && filtered().length === 0) {
      <p
        class="none"
        role="status"
        i18n="Aucune valeur de la liste fermée ne correspond@@profile.chips.none"
      >
        Pas dans la liste : seules les valeurs de l'annuaire peuvent être choisies.
      </p>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
    }
    .box {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 6px 8px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      cursor: text;
    }
    .box:focus-within {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    .box.disabled {
      background: var(--surface-sunken);
      cursor: default;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px 4px 10px;
      border-radius: 999px;
      background: var(--surface-sunken);
      color: var(--text-primary);
      font: var(--mat-sys-body-small);
    }
    .remove {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--border-subtle);
      color: var(--text-primary);
      font: 600 13px/1 var(--font-ui);
      cursor: pointer;
    }
    input {
      flex: 1 1 120px;
      min-width: 120px;
      min-height: 30px;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    input::placeholder {
      color: var(--text-secondary);
    }
    .hint {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .count {
      font-family: var(--font-mono);
    }
    .options {
      position: absolute;
      z-index: 5;
      top: calc(100% - 18px);
      left: 0;
      right: 0;
      max-height: 240px;
      margin: 0;
      padding: 4px;
      overflow: auto;
      list-style: none;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      box-shadow: 0 6px 18px var(--scrim);
    }
    [role='option'] {
      padding: 8px 10px;
      border-radius: 6px;
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      cursor: pointer;
    }
    [role='option'].active {
      background: var(--primary-tint);
      color: var(--primary-hover);
    }
    .none {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipPickerComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input.required<readonly ChipOption[]>();
  readonly hint = input('');
  readonly max = input<number | null>(null);
  readonly placeholder = input(
    $localize`:Invite du champ d'ajout de puces@@profile.chips.placeholder:Ajouter…`,
  );
  /** Maximum atteint : le champ reste focalisable (lecture seule) pour ne pas perdre le focus. */
  protected readonly fullPlaceholder = $localize`:Invite quand le maximum de puces est atteint@@profile.chips.full:Maximum atteint`;
  /** Identifiant d'un message d'erreur à relier au champ (aria-describedby). */
  readonly errorId = input<string | null>(null);

  /** Identifiant du champ de saisie (lien depuis une ligne à corriger, `fieldId()` du contrat). */
  readonly fieldId = input<string | null>(null);

  private readonly uid = nextId++;
  protected readonly inputId = computed(() => this.fieldId() ?? `chip-picker-${this.uid}`);
  protected readonly listId = `chip-picker-${this.uid}-list`;
  protected readonly hintId = `chip-picker-${this.uid}-hint`;

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  readonly value = signal<string[]>([]);
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly disabled = signal(false);

  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly full = computed(() => {
    const max = this.max();
    return max !== null && this.value().length >= max;
  });

  protected readonly chips = computed<ChipOption[]>(() => {
    const byCode = new Map(this.options().map((option) => [option.code, option.label]));
    return this.value().map((code) => ({ code, label: byCode.get(code) ?? code }));
  });

  protected readonly filtered = computed<ChipOption[]>(() => {
    const chosen = new Set(this.value());
    const needle = normalize(this.query().trim());
    return this.options().filter(
      (option) => !chosen.has(option.code) && normalize(option.label).includes(needle),
    );
  });

  protected readonly expanded = computed(
    () => this.open() && !this.disabled() && !this.full() && this.filtered().length > 0,
  );

  protected readonly activeId = computed(() =>
    this.expanded() ? this.optionId(Math.min(this.active(), this.filtered().length - 1)) : null,
  );

  protected readonly describedBy = computed(() =>
    [this.hintId, this.errorId()].filter(Boolean).join(' '),
  );

  protected readonly selectedLabel = computed(
    () =>
      $localize`:Liste des puces choisies@@profile.chips.selected:${this.label()}:field: choisies`,
  );

  writeValue(value: string[] | null): void {
    this.value.set([...(value ?? [])]);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected removeLabel(label: string): string {
    return $localize`:Bouton de retrait d'une puce@@profile.chips.remove:Retirer ${label}:label:`;
  }

  protected focusInput(): void {
    this.field()?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
    this.open.set(true);
  }

  protected onBlur(): void {
    this.open.set(false);
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.active.update((index) => (index + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.active.update((index) => (index - 1 + count) % count);
        break;
      case 'Enter': {
        // Jamais de soumission ni de valeur libre : seule l'option surlignée peut entrer.
        event.preventDefault();
        const option = this.expanded() ? this.filtered()[Math.min(this.active(), count - 1)] : null;
        if (option) this.add(option.code);
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.open.set(false);
        }
        break;
      case 'Backspace':
        if (this.query() === '' && this.value().length > 0) {
          event.preventDefault();
          this.remove(this.value()[this.value().length - 1]);
        }
        break;
    }
  }

  protected add(code: string): void {
    if (this.full() || this.value().includes(code)) return;
    if (!this.options().some((option) => option.code === code)) return;
    this.commit([...this.value(), code]);
    // La liaison [value] ne voit pas de changement si le rendu n'a pas eu lieu entre la frappe et
    // `Entrée` : on vide le champ lui-même.
    const field = this.field()?.nativeElement;
    if (field) field.value = '';
    this.query.set('');
    this.active.set(0);
    // La liste se referme (elle couvrirait les champs suivants) ; flèche bas ou la saisie la rouvre.
    this.open.set(false);
    this.focusInput();
  }

  protected remove(code: string): void {
    this.commit(this.value().filter((value) => value !== code));
    this.focusInput();
  }

  private commit(next: string[]): void {
    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
