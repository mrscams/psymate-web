import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatMenu } from '@angular/material/menu';

import { EntryIconComponent, StateAction, StateComponent } from '../../../shared/ui';
import { SessionDetail, SessionDetailState, SessionGroup } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { TimelineCardComponent } from './timeline-card.component';
import {
  durationLabel,
  modalityLabel,
  sessionHours,
  sessionKindLabel,
  sessionLongDate,
} from './timeline-labels';

/** Clé de dépliage du groupe hors séance (sans identifiant). */
const OUTSIDE = 'outside';

/**
 * Mode par séance (fiche 03, état B ; M3-03) : une carte dépliable par séance (forme du type
 * séance, carré arrondi), de la plus récente à la plus ancienne. La plus récente est dépliée à
 * l'ouverture : horaires, durée, modalité, statut (non clôturée en avertissement), compte rendu et
 * « Ouvrir », puis les entrées rattachées (cartes de la timeline, même menu contextuel). Les autres
 * restent repliées avec leur nombre d'entrées. Les entrées dont la séance n'est pas affichée
 * forment un groupe « Hors séance », en dernier. Le détail d'une séance se lit quand elle se déplie
 * (`expanded`) ; ses trois états passent par shared/ui/state.
 */
@Component({
  selector: 'pm-timeline-sessions',
  imports: [EntryIconComponent, StateComponent, TimelineCardComponent],
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

  /** Une séance se déplie : la page lit son détail. */
  readonly expanded = output<string>();
  readonly opened = output<TimelineItem>();
  readonly linked = output<TimelineItem>();
  /** « Ouvrir » la séance elle-même (éditeur d'entrée sur la séance). */
  readonly openSession = output<string>();
  readonly retryDetail = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly open = signal<ReadonlySet<string>>(new Set());
  private initialized = false;

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
    if (!this.open().has(key)) this.open.update((open) => new Set(open).add(key));
    if (id) this.expanded.emit(id);
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

  protected title(group: SessionGroup): string {
    const date = sessionLongDate(group.from, this.locale);
    const kind = sessionKindLabel(this.detail(group)?.detail?.kind ?? null);
    return date
      ? $localize`:Titre d'une séance du mode par séance@@timeline.session.title:${kind}:kind: du ${date}:date:`
      : kind;
  }

  protected countText(count: number): string {
    if (count === 0)
      return $localize`:Séance sans entrée, dans son en-tête@@timeline.session.noEntry:aucune entrée`;
    return count === 1
      ? $localize`:Nombre d'entrées d'une séance@@timeline.session.entry:1 entrée`
      : $localize`:Nombre d'entrées d'une séance@@timeline.session.entries:${count}:count: entrées`;
  }

  /** Le détail chargé d'une séance, ou null (en cours, en échec, pas encore demandé). */
  protected loaded(group: SessionGroup): SessionDetail | null {
    const state = this.detail(group);
    return state?.status === 'loaded' ? state.detail : null;
  }

  /** Horaires, durée, modalité : les éléments connus. */
  protected facts(detail: SessionDetail): string[] {
    return [
      sessionHours(detail.from, detail.closedAt ? detail.to : null, this.locale),
      detail.durationMin !== null ? durationLabel(detail.durationMin, this.locale) : '',
      modalityLabel(detail.modality),
    ].filter((fact) => !!fact);
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
