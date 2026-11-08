import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  LOCALE_ID,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import { EntryType, SidePanelService, StateAction, StateComponent } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import { openEntryEditor } from '../../entries';
import { PatientShellStore } from '../../patient-shell';
import {
  filtersFromParams,
  filtersToParams,
  GRAPH_ROOT_PARAM,
  PERIOD_PRESETS,
  PeriodPreset,
  presetFrom,
  presetOf,
  SearchFilters,
  TIMELINE_FOCUS_PARAM,
} from '../data/search.model';
import { SearchStore } from '../data/search.store';
import { DossierSearchBar } from '../search-bar';
import {
  canRetry,
  hitTitle,
  isPeriodProblem,
  periodLabel,
  searchProblemText,
  sessionLabel,
  summaryText,
} from '../ui/search-labels';
import { SearchPreviewComponent } from '../ui/search-preview.component';
import { SearchResultsComponent } from '../ui/search-results.component';
import { SyntaxHelpComponent } from '../ui/syntax-help.component';
import { TypeChipsComponent } from '../ui/type-chips.component';

/** Ce que l'onglet range dans la mémoire du dossier (PatientShellStore.rememberTab). */
export interface SearchTabMemory {
  selectedId: string | null;
}

/** Le champ de la barre d'application (shared/ui/app-bar), où l'on tape la recherche. */
const BAR_INPUT_ID = 'app-bar-search';

/**
 * Onglet Recherche du dossier, /patients/:id/search?q=&types=&from=&to=&session=&archived=
 * (fiche 07, B3 flux 5, B4 écran 7). Le champ est celui de la barre d'application (DossierSearchBar
 * le branche) ; les filtres vivent dans l'URL et le SearchStore cherche quand ils changent.
 * Clavier : ↑ ↓ déplacent la sélection (depuis la barre ou la liste), Entrée dans la barre ouvre le
 * résultat dans la timeline, Échap revient à l'écran d'où l'on vient (qui retrouve son état par
 * recallTab). La sélection est rangée dans la mémoire des onglets du shell.
 */
@Component({
  selector: 'pm-patient-search-page',
  imports: [
    SearchPreviewComponent,
    SearchResultsComponent,
    StateComponent,
    SyntaxHelpComponent,
    TypeChipsComponent,
  ],
  providers: [SearchStore],
  templateUrl: './patient-search.page.html',
  styleUrl: './patient-search.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientSearchPage {
  protected readonly store = inject(SearchStore);
  protected readonly shell = inject(PatientShellStore);
  private readonly bar = inject(DossierSearchBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly panels = inject(SidePanelService);
  private readonly locale = inject(LOCALE_ID);
  private readonly results = viewChild(SearchResultsComponent);
  private readonly document = inject(DOCUMENT);

  protected readonly filters = toSignal(
    this.route.queryParamMap.pipe(
      map((params) =>
        filtersFromParams({
          q: params.get('q'),
          types: params.get('types'),
          from: params.get('from'),
          to: params.get('to'),
          session: params.get('session'),
          archived: params.get('archived'),
        }),
      ),
    ),
    { requireSync: true },
  );

  protected readonly patientName = computed(() => this.shell.patient()?.displayName ?? '');
  protected readonly presets = PERIOD_PRESETS;
  protected readonly periodLabel = periodLabel;
  protected readonly period = computed(() => presetOf(this.filters(), new Date()));

  protected readonly sessionOptions = computed(() =>
    (this.store.sessions().data ?? []).map((session) => ({
      id: session.id,
      label: sessionLabel(session, this.locale),
    })),
  );

  protected readonly resultsState = computed(() =>
    stateKind(this.store.results(), (page) => page.exact.length + page.approximate.length === 0),
  );
  protected readonly refreshing = computed(() => isRefreshing(this.store.results()));
  protected readonly problem = computed(() => this.store.results().problem);
  protected readonly problemText = computed(() => searchProblemText(this.problem()));

  protected readonly summary = computed(() => {
    const page = this.store.results().data;
    if (!page || this.store.results().status === 'error') return '';
    return summaryText(
      page.total,
      page.approximate.length,
      this.store.effectiveQuery(),
      page.tookMs,
    );
  });

  /** Réessayer une panne ; une période invalide (from / to de l'URL) se corrige par « Tout le dossier ». */
  protected readonly retryAction = computed<StateAction | undefined>(() => {
    const problem = this.problem();
    if (canRetry(problem)) {
      return {
        label: $localize`:Bouton de l'état erreur@@search.retry:Réessayer`,
        handler: () => void this.store.refresh(),
      };
    }
    if (isPeriodProblem(problem)) {
      return { label: periodLabel('all'), handler: () => this.navigate({ from: null, to: null }) };
    }
    return undefined;
  });

  /** Annonce de la sélection (↑ ↓ depuis la barre : le focus reste dans le champ). */
  protected readonly selectionText = computed(() => {
    const hits = this.store.hits();
    const selected = this.store.selected();
    if (!selected) return '';
    const position = hits.indexOf(selected) + 1;
    const title = hitTitle(selected, this.locale);
    return $localize`:Annonce du résultat sélectionné@@search.selection:Sélection : ${title}:title:, ${position}:position: sur ${hits.length}:count:`;
  });

  protected readonly emptyTitle = computed(
    () =>
      $localize`:État vide de la recherche@@search.empty.title:Aucun résultat pour « ${this.store.effectiveQuery()}:query: »`,
  );

  private destroyed = false;

  constructor() {
    const memory = this.shell.recallTab<SearchTabMemory>('search');
    let first = true;

    // Patient du shell (déjà chargé : l'onglet n'est rendu qu'avec lui), puis filtres de l'URL.
    effect(() => {
      const patientId = this.shell.patientId();
      const filters = this.filters();
      untracked(() => {
        if (!patientId) return;
        this.store.open(patientId);
        this.bar.showQuery(filters.q);
        void this.store.apply(filters, first ? (memory?.selectedId ?? null) : null);
        first = false;
      });
    });

    effect(() => {
      const selectedId = this.store.selectedId();
      untracked(() => this.shell.rememberTab<SearchTabMemory>('search', { selectedId }));
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => (this.destroyed = true));
    destroyRef.onDestroy(this.bar.attach({ submit: () => this.openSelected() }));
    destroyRef.onDestroy(
      inject(ShortcutService).register(
        'Escape',
        () => this.leave(),
        $localize`:Aide des raccourcis@@search.shortcut.escape:Fermer la recherche`,
      ),
    );

    // ↑ ↓ : depuis le champ de la barre (le registre des raccourcis ignore les champs) ou la liste.
    const keydown = (event: KeyboardEvent): void => this.onKeydown(event);
    this.document.addEventListener('keydown', keydown);
    destroyRef.onDestroy(() => this.document.removeEventListener('keydown', keydown));
  }

  protected setType(type: EntryType | null): void {
    this.navigate({ type });
  }

  protected setPeriod(value: string): void {
    const preset = value as PeriodPreset;
    if (preset === 'custom') return;
    this.navigate({ from: presetFrom(preset, new Date()), to: null });
  }

  protected setSession(value: string): void {
    this.navigate({ sessionId: value || null });
  }

  protected setArchived(archived: boolean): void {
    this.navigate({ archived });
  }

  protected select(entryId: string): void {
    this.store.select(entryId);
  }

  /** « Ouvrir dans la timeline » : la timeline se positionne sur l'entrée (?focus=). */
  protected openTimeline(entryId: string): void {
    void this.router.navigate(['/patients', this.shell.patientId(), 'timeline'], {
      queryParams: { [TIMELINE_FOCUS_PARAM]: entryId },
    });
  }

  /** « Voir dans le graphe » : le graphe a l'entrée pour racine (fiche 04, ?root=). */
  protected openGraph(entryId: string): void {
    void this.router.navigate(['/patients', this.shell.patientId(), 'graph'], {
      queryParams: { [GRAPH_ROOT_PARAM]: entryId },
    });
  }

  /** « Modifier » : l'éditeur d'entrée (M1-08) ; après un enregistrement, la recherche est relue. */
  protected edit(entryId: string): void {
    const patientId = this.shell.patientId();
    if (!patientId) return;
    const ref = openEntryEditor(patientId, { entryId, injector: this.injector });
    void ref?.closed.then((saved) => {
      if (saved && !this.destroyed) void this.store.refresh();
    });
  }

  /** Échap : retour à l'écran d'où l'on vient (sinon l'onglet 1), la barre se vide. */
  protected leave(): void {
    // Échap dans une liste déroulante native : c'est elle qu'on ferme, pas la recherche.
    if (this.document.activeElement instanceof HTMLSelectElement) return;
    const patientId = this.shell.patientId();
    if (!patientId) return;
    void this.router.navigateByUrl(this.bar.returnUrl(patientId));
  }

  private openSelected(): void {
    const selected = this.store.selected();
    if (selected) this.openTimeline(selected.entryId);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.panels.isOpen()) return;
    const target = event.target as HTMLElement | null;
    const fromBar = target?.id === BAR_INPUT_ID;
    const fromList = !!target?.closest('pm-search-results');
    // Ailleurs (puces, boutons, fond de page), ↑ ↓ gardent leur rôle : défilement, sélecteurs.
    if (!fromBar && !fromList) return;
    if (this.store.hits().length === 0) return;
    event.preventDefault();
    this.store.move(event.key === 'ArrowDown' ? 1 : -1);
    const list = this.results();
    // Depuis la liste, le focus suit la sélection ; depuis la barre, il y reste (saisie continue).
    if (fromList) list?.focusSelected();
    else list?.revealSelected();
  }

  private navigate(change: Partial<SearchFilters>): void {
    const next = { ...this.filters(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToParams(next),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
