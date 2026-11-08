import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { StateAction, StateComponent } from '../../../shared/ui';
import { uniqueId } from '../../../shared/util';
import { EntryEditorStore } from '../data/entry-editor.store';
import {
  Emotion,
  EmotionFamily,
  EMOTION_FAMILIES,
  filterEmotions,
  hasEmotionLabel,
} from '../data/entry.model';
import { emotionProblemText, familyLabel } from './entry-labels';

/** Une ligne de la liste : une émotion, ou la création d'une émotion personnalisée. */
type Option = { kind: 'emotion'; emotion: Emotion } | { kind: 'create'; label: string };

/**
 * Choix de l'émotion d'un ressenti (fiche 05 §4, fiche 17) : `role="combobox"` sur un
 * `role="listbox"` filtré par préfixe (sans casse ni accents), pastille de famille, ↓ ↑ pour
 * parcourir, ⏎ pour choisir, Échap pour refermer la liste (sans fermer le panneau). Dernière ligne
 * « Créer l'émotion personnalisée « … » » : la famille est obligatoire, puis POST /api/me/emotions
 * crée l'émotion sans quitter le panneau et la sélectionne ; 409 EMOTION_LABEL_EXISTS s'affiche
 * sous le champ. La valeur du contrôle est le code de l'émotion.
 */
@Component({
  selector: 'pm-emotion-combobox',
  imports: [StateComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EmotionComboboxComponent),
      multi: true,
    },
  ],
  templateUrl: './emotion-combobox.component.html',
  styleUrl: './emotion-combobox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusout)': 'onFocusOut($event)' },
})
export class EmotionComboboxComponent implements ControlValueAccessor {
  /** id de l'input (le label du panneau pointe dessus). */
  readonly inputId = input.required<string>();
  /** id du message d'erreur du champ (pm-field-errors), relié par aria-describedby. */
  readonly errorId = input<string>();
  readonly invalid = input(false);

  protected readonly store = inject(EntryEditorStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly listId = uniqueId('pm-emotion-list');
  protected readonly familyId = uniqueId('pm-emotion-family');
  protected readonly createErrorId = uniqueId('pm-emotion-create-error');
  protected readonly families = EMOTION_FAMILIES;

  /** Code choisi (valeur du contrôle). */
  protected readonly code = signal<string | null>(null);
  /** Texte de l'input. */
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly disabled = signal(false);
  /** Création en cours : le libellé à créer et la famille choisie. */
  protected readonly creating = signal<string | null>(null);
  protected readonly family = signal<EmotionFamily | null>(null);
  protected readonly familyMissing = signal(false);

  protected readonly emotions = computed(() => this.store.emotions().data ?? []);
  protected readonly selected = computed(
    () => this.emotions().find((emotion) => emotion.code === this.code()) ?? null,
  );

  protected readonly options = computed<Option[]>(() => {
    const query = this.query().trim();
    const matches: Option[] = filterEmotions(this.emotions(), query).map((emotion) => ({
      kind: 'emotion',
      emotion,
    }));
    if (
      query &&
      this.store.emotions().status === 'loaded' &&
      !hasEmotionLabel(this.emotions(), query)
    ) {
      matches.push({ kind: 'create', label: query });
    }
    return matches;
  });

  /** Aucune option active tant qu'on n'a pas appuyé sur ↓ ou ↑ (fiche 05 : « anx » → ↓ → ⏎). */
  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 && this.active() < this.options().length
      ? this.optionId(this.active())
      : null,
  );

  protected readonly listState = computed(() => {
    const emotions = this.store.emotions();
    if (emotions.status === 'error' && !emotions.data) return 'error';
    if ((emotions.status === 'loading' || emotions.status === 'idle') && !emotions.data)
      return 'loading';
    return this.options().length === 0 ? 'empty' : null;
  });

  protected readonly createProblem = computed(() => {
    const problem = this.store.emotionProblem();
    if (!problem) return null;
    const field = problem.errors?.find((error) => error.field === 'labelFr' || !error.field);
    return emotionProblemText(problem.code, field?.message ?? problem.errors?.[0]?.message);
  });

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.retryEmotions(),
  };
  protected readonly errorTitle = $localize`:Liste des émotions en erreur@@entries.emotion.loadError:Impossible de charger les émotions`;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected familyOf(option: Option): EmotionFamily | null {
    return option.kind === 'emotion' ? option.emotion.family : null;
  }

  protected familyName(family: EmotionFamily): string {
    return familyLabel(family);
  }

  protected createText(label: string): string {
    return $localize`:Dernière ligne de la liste des émotions@@entries.emotion.createOption:Créer l'émotion personnalisée « ${label}:label: »`;
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    this.creating.set(null);
    this.store.clearEmotionProblem();
    if (this.code() !== null) this.select(null);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.move(this.active() < 0 ? 0 : (this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.move(this.active() <= 0 ? count - 1 : this.active() - 1);
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
    if (this.disabled()) return;
    this.open.update((open) => !open);
    this.host.nativeElement.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
  }

  protected choose(option: Option | undefined): void {
    if (!option) return;
    if (option.kind === 'emotion') {
      this.select(option.emotion.code);
      this.query.set(option.emotion.label);
      this.open.set(false);
      this.creating.set(null);
      return;
    }
    this.creating.set(option.label);
    this.family.set(null);
    this.familyMissing.set(false);
    this.open.set(false);
    // La famille est le champ suivant : le focus y va (fiche 17, famille obligatoire).
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>(`#${this.familyId} input`)?.focus(),
    );
  }

  protected chooseFamily(family: EmotionFamily): void {
    this.family.set(family);
    this.familyMissing.set(false);
  }

  /** Entrée dans le choix de famille : crée l'émotion (sans enregistrer l'entrée). */
  protected onFamilyKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      void this.create();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelCreate();
    }
  }

  protected async create(): Promise<void> {
    const label = this.creating();
    const family = this.family();
    if (!label) return;
    if (!family) {
      this.familyMissing.set(true);
      return;
    }
    const emotion = await this.store.createEmotion(label, family);
    if (!emotion) return;
    this.creating.set(null);
    this.select(emotion.code);
    this.query.set(emotion.label);
    this.focusInput();
  }

  protected cancelCreate(): void {
    this.creating.set(null);
    this.store.clearEmotionProblem();
    this.focusInput();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.open.set(false);
    this.onTouched();
    // Saisie sans choix : le texte reprend le libellé de l'émotion choisie (ou reste tel quel).
    const selected = this.selected();
    if (selected && !this.creating()) this.query.set(selected.label);
  }

  private move(index: number): void {
    this.active.set(index);
    const element = this.host.nativeElement.querySelector(`#${this.optionId(index)}`);
    (element as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }

  private select(code: string | null): void {
    this.code.set(code);
    this.onChange(code);
  }

  private focusInput(): void {
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(),
    );
  }

  writeValue(code: string | null): void {
    this.code.set(code ?? null);
    this.query.set(this.emotions().find((item) => item.code === code)?.label ?? '');
  }

  /** Texte affiché : la saisie, ou le libellé du code reçu avant l'arrivée du vocabulaire. */
  protected readonly displayQuery = computed(() => {
    const query = this.query();
    const selected = this.selected();
    return !query && selected ? selected.label : query;
  });

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
