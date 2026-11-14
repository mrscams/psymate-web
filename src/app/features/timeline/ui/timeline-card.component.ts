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
import { TimelineItem } from '../data/timeline.model';
import { rowTime, sessionDate } from './timeline-labels';

/** Tags montrés sur une ligne ; au-delà, « +n ». */
const MAX_TAGS = 3;

/** Les dix cases de l'échelle d'intensité (maquette 03, `.scale`). */
const CELLS = Array.from({ length: 10 }, (_, i) => i);

/**
 * Ligne d'une entrée du flux (proposition 03, `.card`, UX-S9) : le jour est écrit une fois par
 * l'ancre de la page, la ligne ne porte que l'heure en mono (ou la précision : « jour », « mois »…).
 * Titre (sinon le nom de l'émotion d'un ressenti, sinon le titre de repli partagé `entryTitle`),
 * échelle à dix cases et « n/10 » pour un ressenti, chip « brouillon », « en cours » pour une
 * situation sans fin ; seconde ligne : émotion d'un ressenti titré, tags, nombre de liens, pastille
 * « dit en séance du … ». Pas d'extrait : `TimelineItemDto` ne porte pas le texte. Le marqueur du
 * type est posé sur l'axe. Actions au survol ou au focus : Corriger, Lier (L), menu `⋯` (Ouvrir,
 * Corriger, Lier, Voir dans le graphe) aussi par clic droit, `Maj+F10` ou la touche Menu. Entrée ou
 * clic : ouvrir. La place du marqueur de provenance (authorType, A11) est gardée sans être dessinée.
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
  /** Ligne réduite (zoom « Mois », zone « Avant le suivi ») : le titre seul. */
  readonly compact = input(false);
  /** Ligne de la zone « Avant le suivi ». */
  readonly before = input(false);
  readonly selected = input(false);
  /** Début de la séance quand la pastille « dit en séance du … » s'affiche. */
  readonly saidIn = input<string | null>(null);
  readonly emotionLabel = input<string | null>(null);
  /** Mode par séance : la date complète à la place de l'heure (l'entrée peut dater d'un autre jour). */
  readonly fullDate = input(false);
  /** Le menu contextuel partagé par toutes les lignes (Ouvrir, Corriger, Lier, Voir dans le graphe). */
  readonly menu = input.required<MatMenu>();

  readonly opened = output<TimelineItem>();
  /** « Corriger » (bouton au survol) : l'éditeur sur l'entrée. */
  readonly edited = output<TimelineItem>();
  /** `L` ou le bouton Lier : l'éditeur de lien (fiche 06). */
  readonly linked = output<TimelineItem>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required(MatMenuTrigger);

  protected readonly cells = CELLS;
  protected readonly typeLabel = computed(() => entryTypeLabel(this.item().type));
  protected readonly isFeeling = computed(() => this.item().type === 'feeling');

  /**
   * Titre de la ligne. Un ressenti sans titre porte le nom de son émotion (jamais « Ressenti » seul
   * quand l'émotion est connue) ; les autres entrées sans titre le titre de repli partagé (UX-A5).
   */
  protected readonly title = computed(() => {
    const item = this.item();
    if (item.title) return item.title;
    if (item.type === 'feeling' && item.emotion) return this.emotionLabel() ?? item.emotion.code;
    const exact = (item.occurred.precision ?? 'exact') === 'exact';
    return entryTitle(
      { type: item.type, title: item.title, occurred: item.occurred.from },
      this.locale,
      exact ? {} : { timeZone: 'UTC' },
    );
  });

  /** Date complète selon la précision (nom accessible, mode par séance). */
  protected readonly when = computed(() => formatOccurred(this.item().occurred, this.locale));
  /** Ce que la colonne de droite écrit : l'heure, ou la précision ; la date entière par séance. */
  protected readonly time = computed(() =>
    this.fullDate() ? this.when() : rowTime(this.item().occurred, this.locale),
  );

  protected readonly intensity = computed(() => {
    const value = this.item().intensity;
    return this.isFeeling() && value !== null ? Math.max(0, Math.min(10, value)) : null;
  });

  /** Seconde ligne : émotion d'un ressenti titré, tags, liens, « dit en séance du … ». */
  protected readonly showDetails = computed(() => {
    if (this.compact() || this.before()) return false;
    const item = this.item();
    return (
      item.tags.length > 0 ||
      item.linkCount > 0 ||
      this.said() !== null ||
      (this.isFeeling() && !!item.title && !!item.emotion)
    );
  });
  protected readonly said = computed(() => {
    const iso = this.saidIn();
    return iso ? sessionDate(iso, this.locale) : null;
  });

  protected readonly tags = computed(() => this.item().tags.slice(0, MAX_TAGS));
  protected readonly moreTags = computed(() => Math.max(0, this.item().tags.length - MAX_TAGS));

  /** Nom accessible de la ligne : type, titre, date, intensité, statut. */
  protected readonly ariaLabel = computed(() => {
    const item = this.item();
    const parts = [this.typeLabel(), this.title(), this.when()];
    if (this.intensity() !== null) parts.push(`${this.intensity()}/10`);
    if (item.type === 'situation' && item.ongoing) parts.push(this.ongoingLabel);
    if (item.status === 'draft') parts.push(this.draftLabel);
    if (this.said()) parts.push(this.saidText(this.said() ?? ''));
    return parts.filter((part) => !!part).join(', ');
  });

  protected readonly draftLabel = $localize`:Statut brouillon d'une carte de la timeline@@timeline.card.draft:brouillon`;
  protected readonly ongoingLabel = $localize`:Statut d'une situation en cours, sur sa carte@@timeline.card.ongoing:en cours`;
  protected readonly editLabel = $localize`:Bouton Corriger d'une ligne de la timeline@@timeline.card.edit:Corriger`;
  protected readonly linkLabel = $localize`:Bouton Lier d'une ligne de la timeline@@timeline.card.linkAction:Lier (L)`;

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

  /** Entrée (sur la ligne elle-même) ou clic : ouvrir l'entrée. */
  protected open(event: Event): void {
    if (event instanceof KeyboardEvent && event.target !== event.currentTarget) return;
    this.opened.emit(this.item());
  }

  /**
   * `L` sur la ligne elle-même : l'éditeur de lien s'ouvre sur l'entrée. La touche est consommée
   * (le raccourci global L du dossier, qui lie l'entrée ouverte dans l'éditeur, ne la reçoit pas).
   */
  protected link(event: Event): void {
    if (event.target !== event.currentTarget) return;
    if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault();
    this.linked.emit(this.item());
  }

  /** Boutons au survol : l'action, sans ouvrir l'entrée en plus. */
  protected act(event: Event, action: 'edit' | 'link'): void {
    event.stopPropagation();
    if (action === 'edit') this.edited.emit(this.item());
    else this.linked.emit(this.item());
  }

  /** Clic droit, Maj+F10, touche Menu : le menu contextuel s'ouvre sur la ligne. */
  protected openMenu(event: Event): void {
    event.preventDefault();
    this.trigger().openMenu();
  }

  /**
   * À la fermeture sans action (Échap, Tab, clic ailleurs), le focus revient sur la ligne
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
