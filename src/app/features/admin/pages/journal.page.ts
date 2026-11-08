import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { StateAction, StateComponent } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import {
  JOURNAL_CATEGORIES,
  JOURNAL_PERIODS,
  JournalCategory,
  JournalFilters,
  JournalPeriod,
  JournalStore,
} from '../data/journal.store';
import { actorLabel, formatTimestamp, journalCategory, journalSummary } from '../ui/admin-labels';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * /admin/journal (fiche 22) : lecture seule, du plus récent au plus ancien. Segments de type, filtre
 * par administrateur, période, praticien (depuis une ligne ou la page Praticiens) ; tous dans l'URL.
 * « Afficher plus » par curseur, le focus va sur la première nouvelle ligne.
 */
@Component({
  selector: 'pm-journal-page',
  imports: [MatButtonModule, RouterLink, StateComponent],
  providers: [JournalStore],
  templateUrl: './journal.page.html',
  styleUrl: './journal.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalPage {
  readonly type = input<string>();
  readonly actor = input<string>();
  readonly practitioner = input<string>();
  readonly period = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();

  protected readonly store = inject(JournalStore);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly categories = Object.keys(JOURNAL_CATEGORIES) as JournalCategory[];
  protected readonly periods = JOURNAL_PERIODS;

  protected readonly filters = computed<JournalFilters>(() => {
    const type = this.type() as JournalCategory;
    const period = this.period() as JournalPeriod;
    const from = this.from();
    const to = this.to();
    return {
      category: type in JOURNAL_CATEGORIES ? type : 'all',
      actorId: UUID.test(this.actor() ?? '') ? this.actor()! : null,
      practitionerId: UUID.test(this.practitioner() ?? '') ? this.practitioner()! : null,
      period: JOURNAL_PERIODS.includes(period) ? period : '7d',
      from: from && DAY.test(from) ? from : null,
      to: to && DAY.test(to) ? to : null,
    };
  });

  protected readonly kind = computed(() => stateKind(this.store.page()));
  protected readonly refreshing = computed(() => isRefreshing(this.store.page()));
  protected readonly staleError = computed(
    () => this.store.page().status === 'error' && this.kind() === null,
  );

  protected readonly rows = computed(() =>
    this.store.items().map((item) => ({
      ...item,
      time: formatTimestamp(item.at, this.locale),
      category: journalCategory(item.kind),
      text: journalSummary(item.kind, item.summary),
      by: actorLabel(item.actorType, item.actorName),
    })),
  );

  /** Nom du praticien filtré, lu sur une ligne affichée (le journal ne renvoie pas de fiche). */
  protected readonly practitionerName = computed(() => {
    const id = this.filters().practitionerId;
    if (!id) return null;
    return (
      this.store.items().find((item) => item.practitionerId === id)?.practitionerDisplayName ?? null
    );
  });

  /** Légende du tableau : période et filtres actifs, pour les lecteurs d'écran (fiche 22). */
  protected readonly caption = computed(() => {
    const f = this.filters();
    const parts = [this.periodLabel(f.period), this.categoryLabel(f.category)];
    if (f.practitionerId) {
      const name = this.practitionerName() ?? '';
      parts.push(
        $localize`:Filtre praticien actif@@admin.journal.captionPractitioner:praticien ${name}:name:`,
      );
    }
    return $localize`:Légende du journal@@admin.journal.caption:Journal d'administration, du plus récent au plus ancien : ${parts.join(' · ')}:filters:`;
  });

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };

  constructor() {
    effect(() => {
      const filters = this.filters();
      untracked(() => void this.store.setFilters(filters));
    });
    void this.store.loadAdmins();
  }

  protected categoryLabel(category: JournalCategory): string {
    switch (category) {
      case 'admin':
        return $localize`:Segment du journal@@admin.journal.seg.admin:Décisions et actes`;
      case 'documents':
        return $localize`:Segment du journal@@admin.journal.seg.documents:Accès aux documents`;
      case 'appeals':
        return $localize`:Segment du journal@@admin.journal.seg.appeals:Recours`;
      case 'directory':
        return $localize`:Segment du journal@@admin.journal.seg.directory:Annuaire`;
      default:
        return $localize`:Segment du journal@@admin.journal.seg.all:Tout`;
    }
  }

  protected periodLabel(period: JournalPeriod): string {
    switch (period) {
      case '7d':
        return $localize`:Période du journal@@admin.journal.period.7d:7 derniers jours`;
      case '30d':
        return $localize`:Période du journal@@admin.journal.period.30d:30 derniers jours`;
      case 'custom':
        return $localize`:Période du journal@@admin.journal.period.custom:Période personnalisée`;
      default:
        return $localize`:Période du journal@@admin.journal.period.all:Depuis le début`;
    }
  }

  protected setCategory(category: JournalCategory): void {
    this.navigate({ type: category === 'all' ? null : category });
  }

  protected onActor(event: Event): void {
    this.navigate({ actor: (event.target as HTMLSelectElement).value || null });
  }

  protected onPeriod(event: Event): void {
    const period = (event.target as HTMLSelectElement).value as JournalPeriod;
    this.navigate({
      period: period === '7d' ? null : period,
      ...(period === 'custom' ? {} : { from: null, to: null }),
    });
  }

  protected onDay(bound: 'from' | 'to', event: Event): void {
    this.navigate({ [bound]: (event.target as HTMLInputElement).value || null });
  }

  protected filterPractitioner(id: string | null): void {
    this.navigate({ practitioner: id });
  }

  /** « Afficher plus » : le focus va sur la première nouvelle ligne (fiche 22). */
  protected async more(): Promise<void> {
    const before = this.store.items().length;
    const added = await this.store.loadMore();
    if (added === 0) return;
    requestAnimationFrame(() => {
      const rows = this.host.nativeElement.querySelectorAll<HTMLElement>('tbody tr');
      rows[before]?.focus();
    });
  }

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
