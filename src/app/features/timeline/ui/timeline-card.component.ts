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

import { EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { formatOccurred } from '../../../shared/util';
import { TimelineItem, TimelineZoom } from '../data/timeline.model';
import { intensityOpacity, precisionLabel, sessionDate } from './timeline-labels';

/** Tags montrés sur une carte ; au-delà, « +n ». */
const MAX_TAGS = 3;

/**
 * Carte d'un élément de la chronologie (fiche 03, état A) : bordure gauche 3 px et forme du type
 * (jamais d'aplat), titre, date rendue selon sa précision (formatOccurred) et la mention
 * « précision : … », brouillon, ressenti (pastille de famille à l'opacité de l'intensité et
 * « n/10 »), tags, nombre de liens, pastille « dit en séance du … ». Entrée ou clic : ouvrir ;
 * `⋯`, clic droit, `Maj+F10` ou la touche Menu : menu contextuel (fourni par la page). La place du
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
  /** Le menu contextuel partagé par toutes les cartes (Ouvrir, Corriger, Lier, Voir dans le graphe). */
  readonly menu = input.required<MatMenu>();

  readonly opened = output<TimelineItem>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required(MatMenuTrigger);

  protected readonly typeLabel = computed(() => entryTypeLabel(this.item().type));

  protected readonly title = computed(() => {
    const item = this.item();
    if (item.title) return item.title;
    if (item.type === 'feeling' && item.emotion) return this.emotionLabel() ?? item.emotion.code;
    return this.typeLabel();
  });

  protected readonly when = computed(() => formatOccurred(this.item().occurred, this.locale));
  protected readonly precision = computed(() => precisionLabel(this.item().occurred.precision));
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
    if (item.status === 'draft') parts.push(this.draftLabel);
    if (this.said()) parts.push(this.saidText(this.said() ?? ''));
    return parts.filter((part) => !!part).join(', ');
  });

  protected readonly draftLabel = $localize`:Statut brouillon d'une carte de la timeline@@timeline.card.draft:Brouillon`;

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

  protected moreTagsText(count: number): string {
    return $localize`:Tags non affichés d'une carte@@timeline.card.moreTags:+${count}:count:`;
  }

  /** Entrée (sur la carte elle-même) ou clic : ouvrir l'entrée. */
  protected open(event: Event): void {
    if (event instanceof KeyboardEvent && event.target !== event.currentTarget) return;
    this.opened.emit(this.item());
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
