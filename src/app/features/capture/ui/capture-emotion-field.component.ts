import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { uniqueId } from '../../../shared/util';
import { CaptureEmotion, emotionLabelOf, fold } from '../data/capture.model';
import { EmotionProposalComponent, EmotionRequest } from './emotion-proposal.component';

/** Dès 2 lettres sans libellé identique, la liste propose de créer l'émotion. */
const CREATE_MIN = 2;

/**
 * Champ Émotion du bloc de saisie (UX-S1, fiche 05 §4 en version compacte) : `role="combobox"` sur
 * un `role="listbox"` filtré par préfixe (sans casse ni accents, libellé français, anglais ou code),
 * pastille de famille, ↓ ↑ pour parcourir, ⏎ pour choisir, Échap pour refermer la liste sans fermer
 * le bloc. Dernière ligne : « Créer l'émotion « … » », qui ouvre la même proposition (famille
 * obligatoire, POST /api/me/emotions) que la grammaire quand elle lit un mot inconnu devant une
 * intensité (`pendingWord`). La valeur est le code de l'émotion ; le parent la pose dans le brouillon.
 */
@Component({
  selector: 'pm-capture-emotion',
  imports: [EmotionProposalComponent],
  template: `
    <div class="combo" data-focus-ring="container" [class.invalid]="invalid()">
      @if (selected()?.family; as family) {
        <span [class]="'dot family-' + family" aria-hidden="true"></span>
      }
      <input
        [id]="inputId()"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeId()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        placeholder="Anxiété, colère…"
        i18n-placeholder="Texte indicatif du champ émotion du bloc@@capture.emotion.placeholder"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKey($event)"
        (click)="open.set(true)"
      />
      <button
        type="button"
        class="toggle"
        tabindex="-1"
        aria-label="Afficher les émotions"
        i18n-aria-label="Bouton qui déplie la liste des émotions du bloc@@capture.emotion.toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        (click)="toggle()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
    </div>
    <ul
      class="list"
      role="listbox"
      [id]="listId"
      [hidden]="!open() || options().length === 0"
      aria-label="Émotions"
      i18n-aria-label="Nom de la liste des émotions du bloc@@capture.emotion.list"
    >
      @for (option of options(); track option.key; let i = $index) {
        <li
          role="option"
          [id]="optionId(i)"
          [class.active]="i === active()"
          [class.create]="option.kind === 'create'"
          tabindex="-1"
          [attr.aria-selected]="i === active()"
          (mousedown)="$event.preventDefault()"
          (click)="choose(option)"
          (keydown.enter)="choose(option)"
        >
          @if (option.kind === 'emotion') {
            <span
              [class]="'dot family-' + (option.emotion.family ?? 'none')"
              aria-hidden="true"
            ></span>
            <span class="label">{{ option.emotion.label }}</span>
          } @else {
            <svg class="plus" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M8 3v10M3 8h10" />
            </svg>
            <span class="label">{{ createText(option.label) }}</span>
          }
        </li>
      }
    </ul>
    @if (proposalWord(); as word) {
      <pm-emotion-proposal
        [word]="word"
        [busy]="busy()"
        [problem]="problem()"
        (create)="create.emit($event)"
      />
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-width: 0;
    }
    .combo {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-sizing: border-box;
      height: 32px;
      padding: 0 4px 0 10px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
    }
    .combo:focus-within {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-tint);
    }
    .combo.invalid {
      border-color: var(--warning);
    }
    input {
      width: 150px;
      min-width: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }
    input::placeholder {
      color: var(--text-secondary);
      opacity: 1;
    }
    .toggle {
      display: inline-flex;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }
    .toggle svg {
      width: 18px;
      height: 18px;
      margin: auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    .dot {
      flex: none;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--text-disabled);
    }
    .family-joy {
      background: var(--emotion-joy);
    }
    .family-trust {
      background: var(--emotion-trust);
    }
    .family-fear {
      background: var(--emotion-fear);
    }
    .family-surprise {
      background: var(--emotion-surprise);
    }
    .family-sadness {
      background: var(--emotion-sadness);
    }
    .family-disgust {
      background: var(--emotion-disgust);
    }
    .family-anger {
      background: var(--emotion-anger);
    }
    .family-anticipation {
      background: var(--emotion-anticipation);
    }
    .list {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 30;
      box-sizing: border-box;
      width: 280px;
      max-height: 260px;
      margin: 0;
      padding: 4px;
      overflow-y: auto;
      list-style: none;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      box-shadow: 0 8px 24px var(--scrim);
    }
    .list[hidden] {
      display: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      border-radius: 8px;
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      cursor: pointer;
    }
    li.active,
    li:hover {
      background: var(--primary-tint);
    }
    li.create {
      border-top: 1px solid var(--border-subtle);
      border-radius: 0 0 8px 8px;
      color: var(--primary-hover);
    }
    .plus {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    pm-emotion-proposal {
      margin-top: 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusout)': 'onFocusOut($event)' },
})
export class CaptureEmotionFieldComponent {
  readonly emotions = input.required<readonly CaptureEmotion[]>();
  /** Code de l'émotion composée (grammaire ou choix), ou null. */
  readonly value = input<string | null>(null);
  readonly inputId = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);
  /** Mot lu par la grammaire devant une intensité, inconnu ou ambigu (« stress », « tri »). */
  readonly pendingWord = input<string | null>(null);
  /** Le mot est inconnu : la proposition de création s'affiche d'emblée. */
  readonly unknown = input(false);
  readonly busy = input(false);
  readonly problem = input<string | null>(null);

  readonly changed = output<string>();
  readonly create = output<EmotionRequest>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly listId = uniqueId('pm-capture-emotions');

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  /** Libellé que la liste propose de créer (ligne « Créer l'émotion… » choisie). */
  protected readonly creating = signal<string | null>(null);
  /** La saisie du champ a changé depuis la dernière valeur reçue. */
  private readonly dirty = signal(false);

  protected readonly selected = computed(
    () => this.emotions().find((emotion) => emotion.code === this.value()) ?? null,
  );

  protected readonly options = computed<Option[]>(() => {
    const q = fold(this.query());
    const all = this.emotions();
    const found: Option[] = (q ? all.filter((emotion) => matchesQuery(emotion, q)) : all).map(
      (emotion) => ({ kind: 'emotion', key: emotion.code, emotion }),
    );
    const raw = this.query().trim();
    if (
      raw.length >= CREATE_MIN &&
      !all.some((emotion) => fold(emotion.label) === q || fold(emotion.labelFr) === q)
    ) {
      found.push({ kind: 'create', key: 'create', label: raw });
    }
    return found;
  });

  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 && this.active() < this.options().length
      ? this.optionId(this.active())
      : null,
  );

  /** Mot à créer : celui choisi dans la liste, sinon celui que la grammaire n'a pas reconnu. */
  protected readonly proposalWord = computed(
    () => this.creating() ?? (this.unknown() ? this.pendingWord() : null),
  );

  constructor() {
    // Le champ affiche l'émotion composée ; sans émotion, le mot que la grammaire a lu (à corriger).
    effect(() => {
      const selected = this.selected();
      const pending = this.pendingWord();
      untracked(() => {
        if (this.dirty()) return;
        this.query.set(selected?.label ?? pending ?? '');
        if (selected) this.creating.set(null);
      });
    });
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected createText(label: string): string {
    const name = emotionLabelOf(label);
    return $localize`:Dernière ligne de la liste des émotions du bloc@@capture.emotion.createOption:Créer l'émotion « ${name}:label: »`;
  }

  protected onInput(value: string): void {
    this.dirty.set(true);
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    this.creating.set(null);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.active.set(this.active() < 0 ? 0 : (this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
        break;
      case 'Enter': {
        if (!this.open() || count === 0 || event.ctrlKey || event.metaKey) break;
        // Sans option active, ⏎ prend la première émotion proposée (jamais la création).
        const option =
          this.active() >= 0
            ? this.options()[this.active()]
            : this.options().find((item) => item.kind === 'emotion');
        if (!option) break;
        event.preventDefault();
        event.stopPropagation();
        this.choose(option);
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.open.set(false);
        }
        break;
    }
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    this.field()?.focus();
  }

  protected choose(option: Option): void {
    this.open.set(false);
    this.dirty.set(false);
    if (option.kind === 'emotion') {
      this.creating.set(null);
      this.query.set(option.emotion.label);
      this.changed.emit(option.emotion.code);
      return;
    }
    this.creating.set(option.label);
    this.query.set(option.label);
    this.dirty.set(true);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('select')?.focus());
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.open.set(false);
    // Saisie sans choix : le champ reprend l'émotion composée (ou le mot de la grammaire).
    if (!this.creating()) {
      this.dirty.set(false);
      this.query.set(this.selected()?.label ?? this.pendingWord() ?? '');
    }
  }

  private field(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>('input[role="combobox"]');
  }
}

type Option =
  | { kind: 'emotion'; key: string; emotion: CaptureEmotion }
  | { kind: 'create'; key: string; label: string };

/** Libellé (français, anglais) ou code dont le début, ou le début d'un mot, est la saisie. */
function matchesQuery(emotion: CaptureEmotion, q: string): boolean {
  const names = [emotion.label, emotion.labelFr, emotion.labelEn ?? '', emotion.code].map(fold);
  return names.some(
    (name) => name.startsWith(q) || name.split(/[\s'’-]+/).some((word) => word.startsWith(q)),
  );
}
