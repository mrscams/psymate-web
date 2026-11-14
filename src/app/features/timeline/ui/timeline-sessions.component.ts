import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatMenu } from '@angular/material/menu';

import { StateAction, StateComponent } from '../../../shared/ui';
import { SessionDetail, SessionDetailState, SessionGroup } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { TimelineCardComponent } from './timeline-card.component';
import { TimelineDayComponent } from './timeline-day.component';
import { TimelineSessionDividerComponent } from './timeline-session-divider.component';

/** Clé de dépliage du groupe hors séance (sans identifiant). */
const OUTSIDE = 'outside';

/** Séances montrées d'abord (UX-B2 : pas 83 lignes) ; « Afficher les n plus anciennes » en ajoute. */
export const SESSIONS_PAGE = 8;

/**
 * Mode par séance (fiche 03, état B ; M3-03 ; proposition 03, UX-S9) : la même grammaire que le
 * flux chronologique. Une séance par ancre : sa date à gauche de l'axe (« Jeudi 12 », « séance »),
 * son séparateur teinté (« Séance · cabinet · 50 min », « 6 entrées · compte rendu ↓ », « Ouvrir »)
 * qui la déplie ou la replie, la première ligne du compte rendu, puis ses entrées (les lignes de la
 * timeline, même menu contextuel, date complète : une entrée peut dater d'un autre jour). La plus
 * récente est dépliée à l'ouverture ; plus de colonne de compte rendu par séance. Les entrées dont
 * la séance n'est pas affichée forment un groupe « Hors séance », en dernier. Le détail d'une séance
 * se lit quand elle se déplie (`expanded`) ; ses trois états passent par shared/ui/state.
 */
@Component({
  selector: 'pm-timeline-sessions',
  imports: [
    StateComponent,
    TimelineCardComponent,
    TimelineDayComponent,
    TimelineSessionDividerComponent,
  ],
  templateUrl: './timeline-sessions.component.html',
  styleUrl: './timeline-sessions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineSessionsComponent {
  readonly groups = input.required<SessionGroup[]>();
  readonly details = input<Record<string, SessionDetailState>>({});
  readonly emotionLabels = input<Record<string, string>>({});
  readonly selectedId = input<string | null>(null);
  /** Le menu contextuel des cartes, fourni par la page (Ouvrir, Corriger, Lier, Voir dans le graphe). */
  readonly menu = input.required<MatMenu>();
  /** Téléphone : en-têtes de jour au-dessus, sans colonne des dates ni axe. */
  readonly narrow = input(false);
  readonly today = input<Date>(new Date());

  /** Une séance se déplie : la page lit son détail. */
  readonly expanded = output<string>();
  readonly opened = output<TimelineItem>();
  readonly edited = output<TimelineItem>();
  readonly linked = output<TimelineItem>();
  /** « Ouvrir » la séance elle-même (éditeur d'entrée sur la séance). */
  readonly openSession = output<string>();
  readonly retryDetail = output<string>();
  /** « clôturer » d'une séance ouverte. */
  readonly closeSession = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly number = new Intl.NumberFormat(this.locale);
  private readonly open = signal<ReadonlySet<string>>(new Set());
  private initialized = false;
  /** Nombre de séances montrées (les plus récentes). */
  private readonly limit = signal(SESSIONS_PAGE);

  protected readonly shown = computed(() => this.groups().slice(0, this.limit()));
  protected readonly hidden = computed(() => Math.max(0, this.groups().length - this.limit()));

  constructor() {
    // À l'ouverture, la séance la plus récente est dépliée (fiche 03, B2).
    effect(() => {
      const first = this.groups()[0];
      if (!first || this.initialized) return;
      this.initialized = true;
      untracked(() => this.reveal(first.id));
    });
  }

  /** Déplie une séance (null : le groupe hors séance) et en demande le détail. */
  reveal(id: string | null): void {
    const key = id ?? OUTSIDE;
    // Une séance demandée au-delà des premières (?focus=) : la liste s'allonge jusqu'à elle.
    const index = this.groups().findIndex((group) => this.key(group) === key);
    if (index >= this.limit()) this.limit.set(index + 1);
    if (!this.open().has(key)) this.open.update((open) => new Set(open).add(key));
    if (id) this.expanded.emit(id);
  }

  /** « Afficher les n séances plus anciennes » : les suivantes, par paquets. */
  protected showMore(): void {
    this.limit.update((limit) => limit + SESSIONS_PAGE * 2);
  }

  protected key(group: SessionGroup): string {
    return group.id ?? OUTSIDE;
  }

  protected isOpen(group: SessionGroup): boolean {
    return this.open().has(this.key(group));
  }

  protected toggle(group: SessionGroup): void {
    if (this.isOpen(group)) {
      const key = this.key(group);
      this.open.update((open) => {
        const next = new Set(open);
        next.delete(key);
        return next;
      });
    } else {
      this.reveal(group.id);
    }
  }

  protected detail(group: SessionGroup): SessionDetailState | null {
    return group.id ? (this.details()[group.id] ?? null) : null;
  }

  /** Nombre au format de la langue (« 1 204 »). */
  protected count(value: number): string {
    return this.number.format(value);
  }

  /** Le détail chargé d'une séance, ou null (en cours, en échec, pas encore demandé). */
  protected loaded(group: SessionGroup): SessionDetail | null {
    const state = this.detail(group);
    return state?.status === 'loaded' ? state.detail : null;
  }

  private readonly retryActions = new Map<string, StateAction>();

  protected retry(id: string): StateAction {
    let action = this.retryActions.get(id);
    if (!action) {
      action = {
        label: $localize`:Bouton de l'état erreur de la timeline@@timeline.retry:Réessayer`,
        handler: () => this.retryDetail.emit(id),
      };
      this.retryActions.set(id, action);
    }
    return action;
  }

  protected emotionLabel(item: TimelineItem): string | null {
    return item.emotion ? (this.emotionLabels()[item.emotion.code] ?? null) : null;
  }

  protected readonly listLabel = $localize`:Nom de la liste des séances de la timeline@@timeline.sessions.list:Séances, de la plus récente à la plus ancienne`;
  protected readonly entriesLabel = $localize`:Nom de la liste des entrées d'une séance@@timeline.session.entriesList:Entrées de la séance`;
}
