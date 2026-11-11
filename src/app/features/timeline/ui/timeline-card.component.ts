import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
  viewChild,
} from '@angular/core';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { take } from 'rxjs';

import { EntryIconComponent, entryTitle, entryTypeLabel } from '../../../shared/ui';
import { formatOccurred } from '../../../shared/util';
import { SessionKind, SessionModality } from '../data/timeline-sessions.model';
import { TimelineItem, TimelineZoom } from '../data/timeline.model';
import {
  durationLabel,
  intensityOpacity,
  modalityShortLabel,
  precisionLabel,
  sessionDate,
  sessionKindLabel,
} from './timeline-labels';

/**
 * Ce que la carte d'une séance montre en plus (UX-B2, maquette 03 : « Séance · 50 min · cabinet ·
 * 4 entrées · non clôturée ») : lu dans le détail de la séance quand il est là, sinon déduit de
 * l'élément (durée d'après ses bornes). Null : inconnu, rien n'est écrit.
 */
export interface SessionCardInfo {
  kind: SessionKind | null;
  durationMin: number | null;
  modality: SessionModality | null;
  /** Clôturée ; null tant que le détail n'est pas lu. */
  closed: boolean | null;
  /** Entrées rattachées, quand toute la plage est en mémoire et sans filtre ; null sinon. */
  entries: number | null;
}

/** Tags montrés sur une carte ; au-delà, « +n ». */
const MAX_TAGS = 3;

/**
 * Carte d'un élément de la chronologie (fiche 03, état A) : bordure gauche 3 px et forme du type
 * (jamais d'aplat), titre, date rendue selon sa précision (formatOccurred) et la mention
 * « précision : … », brouillon, ressenti (pastille de famille à l'opacité de l'intensité et
 * « n/10 »), tags, nombre de liens, pastille « dit en séance du … ». Entrée ou clic : ouvrir ;
 * `⋯`, clic droit, `Maj+F10` ou la touche Menu : menu contextuel (fourni par la page) ; `L` : lier. La place du
 * marqueur de provenance (authorType, A11) est gardée sans être dessinée.
 */
@Component({
  selector: 'pm-timeline-card',
  imports: [EntryIconComponent, MatMenuTrigger],
  templateUrl: './timeline-card.component.html',
  styleUrl: './timeline-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineCardComponent {
  readonly item = input.required<TimelineItem>();
  readonly zoom = input<TimelineZoom>('week');
  /** Carte de la zone « Avant le suivi » : réduite. */
  readonly before = input(false);
  readonly selected = input(false);
  /** Début de la séance quand la pastille « dit en séance du … » s'affiche. */
  readonly saidIn = input<string | null>(null);
  readonly emotionLabel = input<string | null>(null);
  /** Séance : durée, modalité, statut, nombre d'entrées (null pour les autres types). */
  readonly session = input<SessionCardInfo | null>(null);
  /** Le menu contextuel partagé par toutes les cartes (Ouvrir, Corriger, Lier, Voir dans le graphe). */
  readonly menu = input.required<MatMenu>();

  readonly opened = output<TimelineItem>();
  /** `L` sur la carte : lier l'entrée (éditeur de lien, fiche 06). */
  readonly linked = output<TimelineItem>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required(MatMenuTrigger);

  protected readonly typeLabel = computed(() => entryTypeLabel(this.item().type));
  protected readonly isFeeling = computed(() => this.item().type === 'feeling');

  /**
   * Titre de la carte. Un ressenti sans titre porte le nom de son émotion (l'intensité est dans la
   * puce « n/10 », la date à droite) ; une séance sans titre « Séance · 50 min · cabinet » ; les
   * autres entrées sans titre le titre de repli partagé (UX-A5, shared/ui entryTitle).
   */
  protected readonly title = computed(() => {
    const item = this.item();
    if (item.title) return item.title;
    if (item.type === 'feeling' && item.emotion) return this.emotionLabel() ?? item.emotion.code;
    if (item.type === 'session') return this.sessionTitle();
    const exact = (item.occurred.precision ?? 'exact') === 'exact';
    return entryTitle(
      { type: item.type, title: item.title, occurred: item.occurred.from },
      this.locale,
      exact ? {} : { timeZone: 'UTC' },
    );
  });

  private readonly sessionTitle = computed(() => {
    const info = this.session();
    const occurred = this.item().occurred;
    const minutes = info?.durationMin ?? minutesBetween(occurred.from, occurred.to);
    const parts = [
      sessionKindLabel(info?.kind ?? null),
      minutes !== null ? durationLabel(minutes, this.locale) : '',
      modalityShortLabel(info?.modality ?? null),
    ];
    return parts.filter((part) => !!part).join(' · ');
  });

  protected readonly when = computed(() => formatOccurred(this.item().occurred, this.locale));
  /** « précision : … » seulement si la date n'est pas exacte (UX-B2). */
  protected readonly precision = computed(() => {
    const precision = this.item().occurred.precision ?? 'exact';
    return precision === 'exact' ? null : precisionLabel(precision);
  });
  /** Mois, année, période, phase de vie : pastille tiretée (maquette 03). */
  protected readonly loosePrecision = computed(
    () =>
      (this.item().occurred.precision ?? 'exact') !== 'exact' &&
      this.item().occurred.precision !== 'day',
  );
  /** Tags et liens : sous le titre, sauf au zoom « mois » et dans la zone « Avant le suivi ». */
  protected readonly showDetails = computed(() => {
    if (this.zoom() === 'month' || this.before()) return false;
    const item = this.item();
    return (
      item.tags.length > 0 ||
      item.linkCount > 0 ||
      (!!this.emotionLabel() && !!item.title && item.type === 'feeling')
    );
  });
  protected readonly said = computed(() => {
    const iso = this.saidIn();
    return iso ? sessionDate(iso, this.locale) : null;
  });

  protected readonly tags = computed(() => this.item().tags.slice(0, MAX_TAGS));
  protected readonly moreTags = computed(() => Math.max(0, this.item().tags.length - MAX_TAGS));
  protected readonly dotOpacity = computed(() => intensityOpacity(this.item().intensity));
  protected readonly familyClass = computed(() => {
    const family = this.item().emotion?.family;
    return family ? `family-${family}` : 'family-none';
  });

  /** Nom accessible de la carte : type, titre, date, statut. */
  protected readonly ariaLabel = computed(() => {
    const item = this.item();
    const parts = [this.typeLabel(), this.title(), this.when()];
    if (item.type === 'feeling' && item.intensity !== null) parts.push(`${item.intensity}/10`);
    if (this.session()?.closed === false) parts.push(this.notClosedLabel);
    if (item.status === 'draft') parts.push(this.draftLabel);
    if (this.said()) parts.push(this.saidText(this.said() ?? ''));
    return parts.filter((part) => !!part).join(', ');
  });

  protected readonly draftLabel = $localize`:Statut brouillon d'une carte de la timeline@@timeline.card.draft:Brouillon`;
  protected readonly notClosedLabel = $localize`:Statut d'une séance non clôturée, sur sa carte@@timeline.card.notClosed:non clôturée`;
  protected readonly ongoingLabel = $localize`:Statut d'une situation en cours, sur sa carte@@timeline.card.ongoing:en cours`;

  protected readonly menuLabel = computed(
    () =>
      $localize`:Bouton du menu d'une carte de la timeline@@timeline.card.menu:Actions sur « ${this.title()}:title: » (Maj+F10)`,
  );

  protected saidText(date: string): string {
    return $localize`:Pastille d'une entrée dite en séance un autre jour@@timeline.card.said:dit en séance du ${date}:date:`;
  }

  protected linksText(count: number): string {
    return count === 1
      ? $localize`:Nombre de liens d'une carte@@timeline.card.link:1 lien`
      : $localize`:Nombre de liens d'une carte@@timeline.card.links:${count}:count: liens`;
  }

  protected entriesText(count: number): string {
    const value = new Intl.NumberFormat(this.locale).format(count);
    return count === 1
      ? $localize`:Nombre d'entrées d'une séance, sur sa carte@@timeline.card.entry:1 entrée`
      : count === 0
        ? $localize`:Séance sans entrée, sur sa carte@@timeline.card.noEntry:aucune entrée`
        : $localize`:Nombre d'entrées d'une séance, sur sa carte@@timeline.card.entries:${value}:count: entrées`;
  }

  protected moreTagsText(count: number): string {
    return $localize`:Tags non affichés d'une carte@@timeline.card.moreTags:+${count}:count:`;
  }

  /** Entrée (sur la carte elle-même) ou clic : ouvrir l'entrée. */
  protected open(event: Event): void {
    if (event instanceof KeyboardEvent && event.target !== event.currentTarget) return;
    this.opened.emit(this.item());
  }

  /**
   * `L` sur la carte elle-même : l'éditeur de lien s'ouvre sur l'entrée. La touche est consommée
   * (le raccourci global L du dossier, qui lie l'entrée ouverte dans l'éditeur, ne la reçoit pas).
   */
  protected link(event: Event): void {
    if (event.target !== event.currentTarget) return;
    if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault();
    this.linked.emit(this.item());
  }

  /** Clic droit, Maj+F10, touche Menu : le menu contextuel s'ouvre sur la carte. */
  protected openMenu(event: Event): void {
    event.preventDefault();
    this.trigger().openMenu();
  }

  /**
   * À la fermeture sans action (Échap, Tab, clic ailleurs), le focus revient sur la carte
   * (fiche 03) ; après une action (raison « click », souris ou Entrée), il reste où l'action l'a
   * mis (panneau de l'éditeur, autre onglet).
   */
  protected menuOpened(): void {
    this.menu()
      .closed.pipe(take(1))
      .subscribe((reason) => {
        if (reason !== 'click') this.focus();
      });
  }

  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('article')?.focus();
  }
}

/** Minutes entre deux instants ISO, ou null (fin inconnue, bornes illisibles). */
function minutesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : null;
}
