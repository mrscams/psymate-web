import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';

import { ageInYears } from '../../../../core/i18n';
import { uniqueId } from '../../../../shared/util';
import { PatientOption } from '../../data/data-export.api';

/** Délai entre la frappe et la recherche serveur. */
export const PATIENT_SEARCH_DEBOUNCE_MS = 200;

/**
 * Sélecteur de patient de « Données et export » (fiche 19) : champ `role="combobox"` qui filtre
 * par le serveur, liste `role="listbox"` / `option` (option active en `aria-selected`, suivie par
 * `aria-activedescendant`), patients archivés en gris. `↓` ouvre la liste et parcourt les
 * options, `↑` remonte, `Entrée` choisit, `Échap` ferme. Modifier le texte annule le choix.
 */
@Component({
  selector: 'pm-patient-combobox',
  template: `
    <label class="label" [for]="inputId">{{ label() }}</label>
    <div class="field">
      <input
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [id]="inputId"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeId()"
        [placeholder]="placeholder"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="close()"
      />
      <ul
        class="options"
        role="listbox"
        [id]="listId"
        [attr.aria-label]="listLabel"
        [hidden]="!expanded()"
      >
        @for (option of options(); track option.id; let i = $index) {
          <li
            role="option"
            [id]="optionId(i)"
            [attr.aria-selected]="i === active()"
            [class.active]="i === active()"
            [class.archived]="option.archived"
            tabindex="-1"
            (mousedown)="$event.preventDefault()"
            (click)="choose(option)"
            (keydown.enter)="choose(option)"
          >
            <span class="name">{{ option.displayName }}</span>
            <span class="detail">{{ detail(option) }}</span>
          </li>
        }
      </ul>
    </div>
    @if (open() && !loading() && query().trim() !== '' && options().length === 0) {
      <p
        class="none"
        role="status"
        i18n="Aucun patient ne correspond à la recherche@@account.data.patient.none"
      >
        Aucun dossier ne correspond à cette recherche.
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .label {
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
    }
    .field {
      position: relative;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 8px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-large);
    }
    input:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
    input::placeholder {
      color: var(--text-secondary);
    }
    .options {
      position: absolute;
      z-index: 2;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 280px;
      overflow-y: auto;
      margin: 0;
      padding: 4px;
      list-style: none;
      background: var(--surface-raised);
      border: 1px solid var(--border-strong);
      border-radius: 10px;
    }
    .options[hidden] {
      display: none;
    }
    [role='option'] {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 8px;
      color: var(--text-primary);
      cursor: pointer;
    }
    [role='option'].active {
      background: var(--primary-tint);
    }
    [role='option'].archived .name,
    .detail {
      color: var(--text-secondary);
    }
    .detail {
      font: var(--mat-sys-body-small);
    }
    .none {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientComboboxComponent {
  readonly label = input.required<string>();
  /** Patients proposés pour le texte saisi (le serveur filtre). */
  readonly options = input<PatientOption[]>([]);
  readonly loading = input(false);

  /** Texte saisi, après le délai de frappe : la page relance la recherche. */
  readonly queryChange = output<string>();
  /** Patient choisi, ou null quand le texte ne correspond plus au choix. */
  readonly selectedChange = output<PatientOption | null>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly inputId = uniqueId('patient-combobox');
  protected readonly listId = `${this.inputId}-list`;
  protected readonly placeholder = $localize`:Indication du sélecteur de patient@@account.data.patient.placeholder:Nom affiché…`;
  protected readonly listLabel = $localize`:Étiquette de la liste des patients@@account.data.patient.list:Dossiers correspondants`;

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  private chosen: PatientOption | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly expanded = computed(() => this.open() && this.options().length > 0);
  protected readonly activeId = computed(() =>
    this.expanded() && this.active() >= 0 ? this.optionId(this.active()) : null,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected detail(option: PatientOption): string {
    if (option.archived) {
      return $localize`:Patient archivé dans le sélecteur@@account.data.patient.archived:archivé`;
    }
    const age = ageInYears(option.birthDate);
    return age === null
      ? ''
      : $localize`:Âge dans le sélecteur@@account.data.patient.age:${age}:age: ans`;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    if (this.chosen && this.chosen.displayName !== value) {
      this.chosen = null;
      this.selectedChange.emit(null);
    }
    this.clearTimer();
    this.timer = setTimeout(() => this.queryChange.emit(value.trim()), PATIENT_SEARCH_DEBOUNCE_MS);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.open.set(true);
          this.active.set(count > 0 ? 0 : -1);
        } else if (count > 0) {
          this.active.set(Math.min(this.active() + 1, count - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.open() && count > 0) this.active.set(Math.max(this.active() - 1, 0));
        break;
      case 'Enter': {
        const option = this.expanded() ? this.options()[this.active()] : undefined;
        if (option) {
          event.preventDefault();
          this.choose(option);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }

  protected choose(option: PatientOption): void {
    this.clearTimer();
    this.chosen = option;
    this.query.set(option.displayName);
    this.close();
    this.selectedChange.emit(option);
  }

  protected close(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
