import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';

import {
  EntryIconComponent,
  entryTitle,
  entryTypeLabel,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { Loadable, StateKind, uniqueId } from '../../../shared/util';
import { LinkCandidate, LinkChoice, linkChoices } from '../../entries';
import { LinkTypeOption } from '../../graph';
import { CaptureEmotion, ComposedLink } from '../data/capture.model';
import { SEARCH_MIN_LENGTH } from '../data/capture.store';
import { CaptureEntryType } from '../parser/parse.types';
import { foundFromText } from './capture-labels';

/** Pause de frappe avant de chercher dans le dossier (fiche 07 : 250 ms). */
const SEARCH_DEBOUNCE_MS = 250;

/** Une puce de la rangée : la cible, son nom et les verbes admis pour la paire. */
interface Chip {
  candidate: LinkCandidate;
  name: string;
  choices: LinkChoice[];
}

/**
 * Rangée « Lié à » du bloc de saisie (UX-S1, propositions 04b et 04c) : les cinq cibles du rail
 * (situations en cours d'abord, puis entrées récentes), filtrées par la matrice des types de liens
 * pour le type en cours ; un clic pose UN lien et la puce écrit le verbe en clair, vu depuis la
 * nouvelle entrée (« déclenché par » quand elle est la cible) ; le verbe se change dans la liste des
 * verbes admis pour la paire ; un second clic retire le lien. « Autre entrée… » ouvre une recherche
 * dans tout le dossier (la même que la touche `/`), pour un seul lien, qui remplace le précédent.
 * Composant bête : le parent tient le lien composé et le brouillon.
 */
@Component({
  selector: 'pm-capture-links',
  imports: [EntryIconComponent, StateComponent],
  templateUrl: './capture-links.component.html',
  styleUrl: './capture-links.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusout)': 'onFocusOut($event)' },
})
export class CaptureLinksComponent {
  readonly candidates = input.required<readonly LinkCandidate[]>();
  /** Cible venue de « Autre entrée… », hors des cinq du rail. */
  readonly extra = input<LinkCandidate | null>(null);
  readonly linkTypes = input.required<readonly LinkTypeOption[]>();
  readonly entryType = input.required<CaptureEntryType>();
  readonly emotions = input<readonly CaptureEmotion[]>([]);
  /** Le lien posé, composé par le parent (cible, verbe, verbes admis), ou null. */
  readonly link = input<ComposedLink | null>(null);
  /** Trois états du rail (lecture de la chronologie, catalogue) ; null : les puces. */
  readonly state = input<StateKind | null>(null);
  /** La cible du `>` saisie, pour la mention « trouvé depuis « > … » ». */
  readonly foundFrom = input<string | null>(null);
  readonly search = input<Loadable<LinkCandidate[]>>({ status: 'idle', data: null, problem: null });
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);

  /** Puce cliquée : poser (avec le premier verbe) ou retirer le lien. */
  readonly toggled = output<{ candidate: LinkCandidate; choice: LinkChoice }>();
  /** Verbe changé pour le lien posé. */
  readonly verb = output<LinkChoice>();
  /** Saisie de la recherche « Autre entrée… ». */
  readonly searched = output<string>();
  /** Un résultat de la recherche choisi. */
  readonly other = output<{ candidate: LinkCandidate; choice: LinkChoice }>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly searchId = uniqueId('pm-capture-search');
  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly chips = computed<Chip[]>(() => {
    const types = this.linkTypes();
    const type = this.entryType();
    const extra = this.extra();
    const list = [...this.candidates()];
    if (extra && !list.some((item) => item.id === extra.id)) list.push(extra);
    return list
      .map((candidate) => ({
        candidate,
        name: this.nameOf(candidate),
        choices: linkChoices(types, type, candidate.type),
      }))
      .filter((chip) => chip.choices.length > 0);
  });

  /** Résultats compatibles avec le type en cours, nommés. */
  protected readonly results = computed<Chip[]>(() => {
    const types = this.linkTypes();
    const type = this.entryType();
    return (this.search().data ?? [])
      .map((candidate) => ({
        candidate,
        name: this.nameOf(candidate),
        choices: linkChoices(types, type, candidate.type),
      }))
      .filter((chip) => chip.choices.length > 0);
  });

  protected readonly searchState = computed<StateKind | null>(() => {
    const search = this.search();
    if (this.query().trim().length < SEARCH_MIN_LENGTH) return null;
    if (search.status === 'loading' && !search.data) return 'loading';
    if (search.status === 'error') return 'error';
    if (search.status === 'loaded' && this.results().length === 0) return 'empty';
    return null;
  });

  protected readonly emptyTitle = $localize`:Rangée Lié à vide@@capture.links.emptyTitle:Aucune entrée récente à lier`;
  protected readonly errorTitle = $localize`:Rangée Lié à illisible@@capture.links.errorTitle:Impossible de charger les entrées à lier`;
  protected readonly searchEmptyTitle = $localize`:Recherche Autre entrée sans résultat@@capture.links.searchEmpty:Aucune entrée ne correspond`;
  protected readonly searchErrorTitle = $localize`:Recherche Autre entrée en erreur@@capture.links.searchError:La recherche n'a pas répondu`;
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
  protected readonly searchRetry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => this.searched.emit(this.query()),
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected isPressed(chip: Chip): boolean {
    return this.link()?.candidate.id === chip.candidate.id;
  }

  protected typeName(candidate: LinkCandidate): string {
    return entryTypeLabel(candidate.type);
  }

  protected verbAria(name: string): string {
    return $localize`:Liste des verbes du lien posé@@capture.links.verbLabel:Verbe du lien avec « ${name}:name: »`;
  }

  protected chipAria(chip: Chip): string {
    const name = chip.name;
    const type = entryTypeLabel(chip.candidate.type).toLocaleLowerCase(this.locale);
    return $localize`:Nom lu d'une puce de cible@@capture.links.chipLabel:${name}:name: (${type}:type:)`;
  }

  protected foundText(): string | null {
    const query = this.foundFrom();
    return query && this.link()?.from === 'target' ? foundFromText(query) : null;
  }

  protected selectedVerb(link: ComposedLink): number {
    const index = link.choices.findIndex(
      (choice) =>
        choice.linkType === link.choice.linkType && choice.direction === link.choice.direction,
    );
    return index < 0 ? 0 : index;
  }

  protected toggle(chip: Chip): void {
    const link = this.link();
    const choice = link && link.candidate.id === chip.candidate.id ? link.choice : chip.choices[0];
    this.toggled.emit({ candidate: chip.candidate, choice });
  }

  protected chooseVerb(link: ComposedLink, index: number): void {
    const choice = link.choices[index];
    if (choice) this.verb.emit(choice);
  }

  protected openSearch(): void {
    this.searchOpen.set(true);
    setTimeout(() => this.searchField()?.focus());
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.query.set('');
    clearTimeout(this.timer);
    this.searched.emit('');
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.searched.emit(value), SEARCH_DEBOUNCE_MS);
  }

  protected onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeSearch();
      this.host.nativeElement.querySelector<HTMLElement>('button.other')?.focus();
      return;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      const first = this.results()[0];
      if (first) this.pick(first);
      return;
    }
    if (event.key === 'ArrowDown') {
      const first = this.host.nativeElement.querySelector<HTMLElement>('.results button');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  protected pick(chip: Chip): void {
    this.other.emit({ candidate: chip.candidate, choice: chip.choices[0] });
    this.searchOpen.set(false);
    this.query.set('');
    clearTimeout(this.timer);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('button.other')?.focus());
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    if (this.searchOpen()) this.closeSearch();
  }

  /** Nom d'une cible : titre de repli partagé (« Anxiété 6/10 · 24 oct. », « Note · 24 oct. »). */
  private nameOf(candidate: LinkCandidate): string {
    const emotion =
      candidate.type === 'feeling' && candidate.emotionCode
        ? (this.emotions().find((item) => item.code === candidate.emotionCode)?.label ??
          candidate.emotionCode)
        : null;
    return entryTitle(
      {
        type: candidate.type,
        title: candidate.title,
        occurred: candidate.occurred.from,
        emotion,
        intensity: candidate.intensity,
      },
      this.locale,
      candidate.occurred.precision === 'exact' ? {} : { timeZone: 'UTC' },
    );
  }

  private searchField(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(`#${this.searchId}`);
  }
}
