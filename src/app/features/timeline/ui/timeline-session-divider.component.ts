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
  viewChild,
} from '@angular/core';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { take } from 'rxjs';

import { EntryIconComponent, UNCLOSED_SESSION_AFTER_MIN } from '../../../shared/ui';
import { formatOccurred } from '../../../shared/util';
import { SessionDetail } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { durationLabel, modalityShortLabel, sessionKindLabel } from './timeline-labels';

/**
 * Séparateur de séance (proposition 03, `.session-head`, UX-S9) : une ligne teintée séance dans le
 * flux, « Séance · cabinet · 50 min », à droite « 6 entrées · compte rendu ↓ », puis la première
 * ligne du compte rendu quand le détail de la séance (GET /api/entries/{id}) en a un. Séance ouverte
 * : « en cours depuis 12 min », « n entrées notées · clôturer » (vers l'onglet Séance, où se trouve
 * le panneau de clôture). Deux usages : dans le flux chronologique, la ligne ouvre la séance
 * (Entrée, clic ; `L` lie ; `⋯`, clic droit, `Maj+F10` : le menu des lignes) ; dans le mode par
 * séance (`toggle`), elle déplie ou replie la séance (bouton `aria-expanded`), « Ouvrir » à droite.
 */
@Component({
  selector: 'pm-timeline-session-divider',
  imports: [EntryIconComponent, MatMenuTrigger],
  templateUrl: './timeline-session-divider.component.html',
  styleUrl: './timeline-session-divider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineSessionDividerComponent {
  /** L'élément séance de la chronologie (null : séance connue par l'index seulement). */
  readonly item = input<TimelineItem | null>(null);
  /** Identifiant de la séance (celui de l'élément, ou du groupe du mode par séance). */
  readonly sessionId = input.required<string>();
  /** Début de la séance quand l'élément n'est pas lu (mode par séance). */
  readonly from = input<string | null>(null);
  /** Détail de la séance (modalité, durée, clôture, compte rendu), null tant qu'il n'est pas lu. */
  readonly detail = input<SessionDetail | null>(null);
  /** Entrées rattachées, quand le compte est sûr ; null sinon (rien n'est écrit). */
  readonly entries = input<number | null>(null);
  /** Sans la ligne du compte rendu (zoom « Mois »). */
  readonly compact = input(false);
  readonly selected = input(false);
  /** Mode par séance : la ligne déplie la séance. */
  readonly toggle = input(false);
  readonly expanded = input(false);
  readonly controls = input<string | null>(null);
  /** Menu des lignes (flux chronologique) ; absent en mode par séance. */
  readonly menu = input<MatMenu | null>(null);

  readonly opened = output<string>();
  readonly linked = output<TimelineItem>();
  readonly toggled = output<void>();
  /** « clôturer » d'une séance ouverte : l'onglet Séance. */
  readonly closeRequested = output<string>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild(MatMenuTrigger);
  /** Horloge de « en cours depuis n min », relue chaque minute. */
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly start = computed(() => this.item()?.occurred.from ?? this.from());
  /**
   * Séance ouverte : son détail est lu et elle n'a pas de clôture. La séance d'accueil (kind
   * intake) est créée avec le patient et jamais clôturée : le contrat dit qu'elle ne compte pas
   * comme séance ouverte (sessions/current, start), elle n'est donc ni « en cours », ni « non
   * clôturée », et n'offre pas « clôturer » (ce lien mène à l'onglet Séance, qui n'existe que
   * pour une séance ouverte).
   */
  protected readonly open = computed(() => {
    const detail = this.detail();
    return !!detail && detail.closedAt === null && detail.kind !== 'intake';
  });

  /** Minutes écoulées depuis le début d'une séance ouverte. */
  private readonly elapsed = computed(() => {
    const start = Date.parse(this.start() ?? '');
    return Number.isNaN(start) ? 0 : Math.max(0, Math.floor((this.now() - start) / 60_000));
  });
  /**
   * Séance ouverte depuis peu : « en cours depuis n min ». Au-delà de UNCLOSED_SESSION_AFTER_MIN
   * (même seuil que la barre de séance, UX-A8), elle est « non clôturée », sans chronomètre.
   */
  protected readonly running = computed(
    () => this.open() && this.elapsed() <= UNCLOSED_SESSION_AFTER_MIN,
  );

  /** « Séance · cabinet · 50 min », ou « Séance · cabinet · en cours depuis 12 min ». */
  protected readonly label = computed(() => {
    const detail = this.detail();
    const item = this.item();
    const parts = [
      item?.title?.trim() || sessionKindLabel(detail?.kind ?? null),
      modalityShortLabel(detail?.modality ?? null),
    ];
    if (this.running()) {
      parts.push(this.runningText(durationLabel(this.elapsed(), this.locale)));
    } else if (this.open()) {
      parts.push(this.unclosedLabel);
    } else {
      const minutes =
        detail?.durationMin ?? minutesBetween(this.start(), detail?.to ?? item?.occurred.to);
      if (minutes !== null) parts.push(durationLabel(minutes, this.locale));
    }
    return parts.filter((part) => !!part).join(' · ');
  });

  /** Première ligne du compte rendu, s'il y en a un. */
  protected readonly summary = computed(() => {
    if (this.compact()) return null;
    const text = this.detail()?.summary?.trim();
    return text ? (text.split(/\r?\n/).find((line) => line.trim()) ?? '').trim() : null;
  });

  protected readonly entriesText = computed(() => {
    const count = this.entries();
    if (count === null) return '';
    const value = new Intl.NumberFormat(this.locale).format(count);
    if (this.running())
      return count === 1
        ? $localize`:Entrées notées dans une séance ouverte, séparateur de la timeline@@timeline.divider.notedOne:1 entrée notée`
        : count === 0
          ? $localize`:Aucune entrée notée dans une séance ouverte, séparateur de la timeline@@timeline.divider.notedNone:aucune entrée notée`
          : $localize`:Entrées notées dans une séance ouverte, séparateur de la timeline@@timeline.divider.noted:${value}:count: entrées notées`;
    return count === 1
      ? $localize`:Nombre d'entrées d'une séance, sur sa carte@@timeline.card.entry:1 entrée`
      : count === 0
        ? $localize`:Séance sans entrée, sur sa carte@@timeline.card.noEntry:aucune entrée`
        : $localize`:Nombre d'entrées d'une séance, sur sa carte@@timeline.card.entries:${value}:count: entrées`;
  });

  /** Nom accessible : genre, date, modalité, durée ou « en cours », entrées, compte rendu. */
  protected readonly ariaLabel = computed(() => {
    const when = formatOccurred({ from: this.start(), precision: 'exact' }, this.locale);
    return [this.label(), when, this.entriesText(), this.summary() ? this.reportLabel : '']
      .filter((part) => !!part)
      .join(', ');
  });

  protected readonly unclosedLabel = $localize`:Séance ouverte depuis longtemps, séparateur de la timeline@@timeline.divider.unclosed:non clôturée`;
  protected readonly reportLabel = $localize`:Mention du compte rendu sous un séparateur de séance@@timeline.divider.report:compte rendu`;
  protected readonly closeLabel = $localize`:Lien clôturer d'une séance ouverte, séparateur de la timeline@@timeline.divider.close:clôturer`;
  protected readonly closeName = $localize`:Nom accessible du lien clôturer d'une séance ouverte@@timeline.divider.closeName:Clôturer la séance (onglet Séance)`;
  protected readonly openLabel = $localize`:Bouton Ouvrir une séance@@timeline.session.open:Ouvrir`;
  protected readonly menuLabel = computed(
    () =>
      $localize`:Bouton du menu d'une carte de la timeline@@timeline.card.menu:Actions sur « ${this.label()}:title: » (Maj+F10)`,
  );

  private runningText(duration: string): string {
    return $localize`:Durée d'une séance ouverte, séparateur de la timeline@@timeline.divider.running:en cours depuis ${duration}:duration:`;
  }

  /** Entrée ou clic sur la ligne : ouvrir la séance (flux) ou la déplier (par séance). */
  protected activate(event: Event): void {
    if (event instanceof KeyboardEvent && event.target !== event.currentTarget) return;
    if (this.toggle()) this.toggled.emit();
    else this.opened.emit(this.sessionId());
  }

  protected link(event: Event): void {
    const item = this.item();
    if (!item || this.toggle() || event.target !== event.currentTarget) return;
    if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault();
    this.linked.emit(item);
  }

  protected openMenu(event: Event): void {
    const trigger = this.trigger();
    if (!trigger) return;
    event.preventDefault();
    trigger.openMenu();
  }

  protected menuOpened(): void {
    this.menu()
      ?.closed.pipe(take(1))
      .subscribe((reason) => {
        if (reason !== 'click') this.focus();
      });
  }

  protected close(event: Event): void {
    event.stopPropagation();
    this.closeRequested.emit(this.sessionId());
  }

  protected openSession(event: Event): void {
    event.stopPropagation();
    this.opened.emit(this.sessionId());
  }

  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.head')?.focus();
  }
}

function minutesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : null;
}
