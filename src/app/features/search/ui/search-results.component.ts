import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { NgTemplateOutlet } from '@angular/common';

import { EntryIconComponent, entryTypeLabel } from '../../../shared/ui';
import { SearchHit, SessionOption } from '../data/search.model';
import { MarkedTextComponent } from './marked-text.component';
import { hitTitle, hitWhen, precisionLabel, sessionLabel } from './search-labels';

/**
 * Listes de résultats (fiche 07) : exacts, puis « Résultats approchés » (trigrammes, tolérance aux
 * fautes) quand le serveur en ajoute. Chaque résultat : icône de type, titre et extrait surlignés,
 * méta (type · date · précision), ligne de contexte (séance, tags, archivée). Le résultat
 * sélectionné porte aria-current ; un clic le sélectionne, un double-clic l'ouvre dans la timeline.
 */
@Component({
  selector: 'pm-search-results',
  imports: [EntryIconComponent, MarkedTextComponent, NgTemplateOutlet],
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultsComponent {
  readonly exact = input.required<SearchHit[]>();
  readonly approximate = input.required<SearchHit[]>();
  readonly selectedId = input<string | null>(null);
  readonly sessions = input<SessionOption[]>([]);
  readonly selectHit = output<string>();
  readonly openHit = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected typeLabel = entryTypeLabel;
  protected precision = precisionLabel;

  protected when(hit: SearchHit): string {
    return hitWhen(hit, this.locale);
  }

  /** Titre affiché sans titre d'entrée : le type, ou « Séance du … » pour une séance. */
  protected fallbackTitle(hit: SearchHit): string {
    return hitTitle(hit, this.locale);
  }

  /** Entrée sur un résultat : l'ouvre dans la timeline (fiche 07), sans repasser par le clic. */
  protected enter(event: Event, hit: SearchHit): void {
    event.preventDefault();
    this.selectHit.emit(hit.entryId);
    this.openHit.emit(hit.entryId);
  }

  protected sessionOf(hit: SearchHit): string | null {
    if (!hit.sessionId) return null;
    const session = this.sessions().find((item) => item.id === hit.sessionId);
    return session ? sessionLabel(session, this.locale) : null;
  }

  /** Met le focus sur le bouton du résultat sélectionné (↑ ↓ depuis la liste). */
  focusSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    const button = this.host.nativeElement.querySelector<HTMLButtonElement>(
      `button[data-entry-id="${CSS.escape(id)}"]`,
    );
    button?.focus();
    button?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Le résultat sélectionné reste visible quand ↑ ↓ le déplacent depuis la barre. */
  revealSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.host.nativeElement
      .querySelector(`li[data-entry-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }
}
