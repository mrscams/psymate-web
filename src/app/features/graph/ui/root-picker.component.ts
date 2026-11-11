import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ENTRY_TYPES, EntryIconComponent, EntryType, entryTypeLabel } from '../../../shared/ui';
import { uniqueId } from '../../../shared/util';

/** Une entrée proposée par « Centré sur » : nom (titre de repli), type, date courte. */
export interface RootOption {
  id: string;
  type: EntryType;
  name: string;
  /** Date courte (« 24 oct. ») ; vide sans date. */
  date: string;
}

/** L'entrée au centre du graphe, telle que le bouton la montre ; null : tout le dossier. */
export interface RootChoice {
  type: EntryType | null;
  name: string;
}

/** Valeur choisie : l'identifiant d'une entrée, ou null pour tout le dossier. */
export type RootPicked = string | null;

interface Group {
  type: EntryType;
  label: string;
  labelId: string;
  options: (RootOption & { optionId: string })[];
}

const ALL_OPTION_ID = 'all';

/**
 * « Centré sur » (fiche 04 §2, UX-B3) : un bouton qui montre la racine (icône de type, nom) et ouvre
 * une liste filtrable — un champ `role="combobox"` et une `role="listbox"` groupée par type
 * d'entrée. Sans texte : « Tout le dossier » (avec son avertissement) puis les entrées du graphe ;
 * avec un texte : celles qui correspondent (nom, type, date) puis les résultats de la recherche du
 * dossier (`remote`, page fournie par la page). Flèches, Début, Fin, Entrée, Échap ; le focus
 * revient au bouton à la fermeture. Remplace le `select` natif de 150 options (nom accessible
 * pollué, entrées sans titre indiscernables).
 */
@Component({
  selector: 'pm-graph-root-picker',
  imports: [EntryIconComponent],
  template: `
    <span class="label" [id]="labelId" i18n="Sélecteur de la racine du graphe@@graph.root.label"
      >Centré sur</span
    >
    <div class="anchor">
      <button
        #trigger
        type="button"
        class="trigger"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listId : null"
        [attr.aria-labelledby]="labelId + ' ' + valueId"
        (click)="toggle()"
        (keydown)="onTriggerKey($event)"
      >
        @if (current()?.type; as type) {
          <pm-entry-icon [type]="type" [size]="14" />
        } @else {
          <svg class="all-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="4" cy="4" r="2" />
            <circle cx="12" cy="5" r="2" />
            <circle cx="7" cy="12" r="2" />
            <path d="M4 4l8 1M12 5l-5 7M4 4l3 8" />
          </svg>
        }
        <span class="value" [id]="valueId">{{ current()?.name ?? allLabel }}</span>
        <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      @if (open()) {
        <div class="popup" (focusout)="onFocusOut($event)">
          <input
            #search
            type="text"
            class="search"
            role="combobox"
            autocomplete="off"
            aria-autocomplete="list"
            aria-expanded="true"
            [attr.aria-controls]="hasOptions() ? listId : null"
            [attr.aria-activedescendant]="activeId()"
            [attr.aria-label]="searchLabel"
            [placeholder]="searchPlaceholder"
            [value]="query()"
            (input)="onInput($event)"
            (keydown)="onKey($event)"
          />
          @if (hasOptions()) {
            <div class="list" role="listbox" [id]="listId" [attr.aria-label]="listLabel">
              @if (!query().trim()) {
                <div
                  role="option"
                  class="option all"
                  [id]="allOptionId"
                  [class.active]="activeId() === allOptionId"
                  [attr.aria-selected]="selectedId() === null"
                  tabindex="-1"
                  (mousedown)="$event.preventDefault()"
                  (click)="pick(null)"
                  (keydown.enter)="pick(null)"
                >
                  <span class="option-text">
                    <span class="option-name">{{ allLabel }}</span
                    >&ngsp;<span class="option-meta warning">{{ allWarning() }}</span>
                  </span>
                </div>
              }
              @for (group of groups(); track group.type) {
                <ul class="group" role="group" [attr.aria-labelledby]="group.labelId">
                  <li role="presentation" class="group-label" [id]="group.labelId">
                    {{ group.label }}
                  </li>
                  @for (option of group.options; track option.id) {
                    <li
                      role="option"
                      class="option"
                      [id]="option.optionId"
                      [class.active]="activeId() === option.optionId"
                      [attr.aria-selected]="option.id === selectedId()"
                      tabindex="-1"
                      (mousedown)="$event.preventDefault()"
                      (click)="pick(option.id)"
                      (keydown.enter)="pick(option.id)"
                    >
                      <pm-entry-icon [type]="option.type" [size]="14" />
                      <span class="option-text">
                        <span class="option-name">{{ option.name }}</span>
                        @if (option.date) {
                          &ngsp;<span class="option-meta mono">{{ option.date }}</span>
                        }
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
          } @else if (!searching()) {
            <p class="empty" i18n="Aucune entrée trouvée par Centré sur@@graph.root.none">
              Aucune entrée ne correspond.
            </p>
          }
          <p class="status" aria-live="polite">{{ statusText() }}</p>
        </div>
      }
    </div>
  `,
  styleUrl: './root-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RootPickerComponent {
  /** La racine affichée ; null : tout le dossier. */
  readonly current = input<RootChoice | null>(null);
  /** Identifiant de la racine (option cochée) ; null : tout le dossier. */
  readonly selectedId = input<string | null>(null);
  /** Les entrées du graphe reçu (proposées sans texte). */
  readonly options = input<readonly RootOption[]>([]);
  /** Résultats de la recherche du dossier pour le texte saisi. */
  readonly remote = input<readonly RootOption[]>([]);
  /** La recherche du dossier est en cours. */
  readonly searching = input(false);
  /** La recherche du dossier a échoué (les entrées du graphe restent proposées). */
  readonly searchFailed = input(false);
  /** Avertissement de « Tout le dossier » (« jusqu'à 150 nœuds, étiquettes masquées »). */
  readonly allWarning = input('');

  /** Une entrée (identifiant) ou tout le dossier (null). */
  readonly picked = output<RootPicked>();
  /** Le texte saisi, pour la recherche du dossier (la page la lance après un délai). */
  readonly searched = output<string>();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly labelId = uniqueId('pm-root-label');
  protected readonly valueId = uniqueId('pm-root-value');
  protected readonly listId = uniqueId('pm-root-list');
  protected readonly allOptionId = `${this.listId}-${ALL_OPTION_ID}`;
  protected readonly allLabel = $localize`:Racine du graphe, tout le dossier@@graph.root.all:Tout le dossier`;
  protected readonly searchLabel = $localize`:Champ de recherche de la racine du graphe@@graph.root.searchLabel:Chercher l'entrée au centre du graphe`;
  protected readonly searchPlaceholder = $localize`:Indication du champ de recherche de la racine@@graph.root.searchPlaceholder:Titre, type ou date…`;
  protected readonly listLabel = $localize`:Nom de la liste des racines possibles@@graph.root.listLabel:Entrées du dossier`;

  protected readonly open = signal(false);
  protected readonly query = signal('');
  private readonly active = signal(0);

  /** Options visibles, groupées par type (ordre des types du produit), sans doublon. */
  protected readonly groups = computed<Group[]>(() => {
    const text = normalize(this.query().trim());
    const seen = new Set<string>();
    const all: RootOption[] = [];
    const local = text
      ? this.options().filter((option) =>
          normalize(`${option.name} ${entryTypeLabel(option.type)} ${option.date}`).includes(text),
        )
      : this.options();
    for (const option of [...local, ...(text ? this.remote() : [])]) {
      if (seen.has(option.id)) continue;
      seen.add(option.id);
      all.push(option);
    }
    return ENTRY_TYPES.map((type) => ({
      type,
      label: entryTypeLabel(type),
      labelId: `${this.listId}-group-${type}`,
      options: all
        .filter((option) => option.type === type)
        .map((option) => ({ ...option, optionId: `${this.listId}-${option.id}` })),
    })).filter((group) => group.options.length > 0);
  });

  /** Identifiants des options dans l'ordre de la liste (navigation aux flèches). */
  private readonly order = computed(() => {
    const ids: { optionId: string; value: RootPicked }[] = [];
    if (!this.query().trim()) ids.push({ optionId: this.allOptionId, value: null });
    for (const group of this.groups()) {
      for (const option of group.options) ids.push({ optionId: option.optionId, value: option.id });
    }
    return ids;
  });

  protected readonly hasOptions = computed(() => this.order().length > 0);

  protected readonly activeId = computed(() => {
    const order = this.order();
    if (!order.length) return null;
    return order[Math.min(this.active(), order.length - 1)].optionId;
  });

  protected readonly statusText = computed(() => {
    if (!this.query().trim()) return '';
    if (this.searching()) {
      return $localize`:Recherche de la racine dans le dossier en cours@@graph.root.searching:Recherche dans tout le dossier…`;
    }
    if (this.searchFailed()) {
      return $localize`:Recherche de la racine en échec@@graph.root.searchFailed:La recherche dans le dossier a échoué ; seules les entrées du graphe sont proposées.`;
    }
    const count = this.order().length;
    return $localize`:Nombre d'entrées proposées par Centré sur@@graph.root.count:${count}:count: entrées proposées`;
  });

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.show();
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.open()) {
      event.preventDefault();
      this.show();
    }
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.active.set(0);
    this.searched.emit(value);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.order().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.active.set((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.active.set((this.active() - 1 + count) % count);
        break;
      case 'Home':
        event.preventDefault();
        this.active.set(0);
        break;
      case 'End':
        event.preventDefault();
        if (count) this.active.set(count - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.order()[Math.min(this.active(), count - 1)];
        if (item) this.pick(item.value);
        break;
      }
      case 'Escape':
        // Échap ferme la liste seulement (pas le dossier, pas un panneau).
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
      default:
        return;
    }
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      this.scrollActive();
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.close(false);
  }

  protected pick(value: RootPicked): void {
    this.close(true);
    if (value !== this.selectedId()) this.picked.emit(value);
  }

  private show(): void {
    this.query.set('');
    const index = this.order().findIndex((item) => item.value === this.selectedId());
    this.open.set(true);
    this.active.set(Math.max(0, index));
    afterNextRender(
      () => {
        this.searchInput()?.nativeElement.focus();
        this.scrollActive();
      },
      { injector: this.injector },
    );
  }

  private close(focusTrigger: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (this.query()) this.searched.emit('');
    this.query.set('');
    if (focusTrigger) this.trigger().nativeElement.focus();
  }

  private scrollActive(): void {
    afterNextRender(
      () => {
        const id = this.activeId();
        if (!id) return;
        this.host.nativeElement
          .querySelector(`[id="${id}"]`)
          ?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }
}

/** Minuscules sans accents, pour filtrer « evenement » comme « Événement ». */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
