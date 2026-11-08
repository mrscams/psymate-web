import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { PreferencesStore } from '../../../core/preferences';
import { ShortcutService } from '../../../core/shortcuts';
import { EntryIconComponent, StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { formatOccurred, StateKind } from '../../../shared/util';
import { openEntryEditor } from '../../entries';
import { openLinkEditor } from '../../graph';
import { PatientShellStore } from '../../patient-shell';
import {
  hasFilterParams,
  NO_FILTERS,
  sameFilters,
  sameParam,
  TimelineFilters,
  TimelineMode,
} from '../data/timeline-filters.model';
import { TimelineFiltersStore } from '../data/timeline-filters.store';
import { TimelineSessionStore } from '../data/timeline-session.store';
import { groupBySession } from '../data/timeline-sessions.model';
import {
  MAX_WINDOWS,
  ROW_HEIGHT,
  TimelineItem,
  TimelineRow,
  TimelineSnapshot,
  WINDOW_SIZE,
} from '../data/timeline.model';
import { TimelineStore } from '../data/timeline.store';
import { TIMELINE_FOCUS_PARAM } from '../timeline.params';
import { RovingToolbarDirective } from '../ui/roving-toolbar.directive';
import { TimelineCardComponent } from '../ui/timeline-card.component';
import { TimelineFiltersComponent } from '../ui/timeline-filters.component';
import { groupLabel, zoomLabel } from '../ui/timeline-labels';
import { TimelineModeComponent } from '../ui/timeline-mode.component';
import { TimelineSessionsComponent } from '../ui/timeline-sessions.component';

/** Délai minimal entre deux crans de zoom à la molette (un geste = un cran). */
const WHEEL_STEP_MS = 180;

/**
 * Onglet 2 du dossier, /patients/:id/timeline (fiche 03 ; B4 écran 3). Barre d'outils (filtres,
 * Chronologique | Par séance, zoom) parcourue aux flèches. Mode chronologique (état A) : axe
 * vertical, cartes par type, bandes des situations qui chevauchent la plage, zone « Avant le
 * suivi », défilement virtuel CDK sur toute la liste (créneaux vides hors des trois fenêtres en
 * mémoire), zoom `Ctrl+molette`, `+`, `-` sans requête tant que les fenêtres couvrent. Mode par
 * séance (état B) : séances dépliables. Menu contextuel au clavier, `L` lie l'entrée. Filtres et
 * mode : URL (`?types=&emotion=&tag=&drafts=&from=&to=&mode=`) et mémoire de l'onglet. Vue
 * décennie : M3-04.
 */
@Component({
  selector: 'pm-timeline-page',
  imports: [
    EntryIconComponent,
    MatMenuModule,
    RovingToolbarDirective,
    ScrollingModule,
    StateComponent,
    TimelineCardComponent,
    TimelineFiltersComponent,
    TimelineModeComponent,
    TimelineSessionsComponent,
  ],
  providers: [TimelineStore, TimelineFiltersStore, TimelineSessionStore],
  templateUrl: './timeline.page.html',
  styleUrl: './timeline.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePage {
  protected readonly store = inject(TimelineStore);
  protected readonly filters = inject(TimelineFiltersStore);
  protected readonly sessionDetails = inject(TimelineSessionStore);
  protected readonly prefs = inject(PreferencesStore);
  private readonly toasts = inject(ToastService);
  private readonly shell = inject(PatientShellStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly shortcuts = inject(ShortcutService);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  private readonly toolbar = viewChild.required(RovingToolbarDirective);
  private readonly sessionsView = viewChild(TimelineSessionsComponent);

  protected readonly mode = this.filters.mode;
  /** Séances des fenêtres lues (mode par séance), de la plus récente à la plus ancienne. */
  protected readonly groups = computed(() =>
    groupBySession(this.store.head().items, this.store.sessions()),
  );
  protected readonly sessionCount = computed(() => this.groups().filter((g) => g.id).length);
  /** Les filtres sont appliqués : avant, l'URL n'est pas réécrite (elle n'a pas encore été lue). */
  private readonly ready = signal(false);

  protected readonly rowHeight = computed(() => ROW_HEIGHT[this.store.zoom()]);
  protected readonly zoomText = computed(() => zoomLabel(this.store.zoom()));
  protected readonly lanes = computed(() => {
    const bands = this.store.bands();
    return bands.length ? Math.max(...bands.map((band) => band.lane)) + 1 : 0;
  });

  protected readonly state = computed<StateKind | null>(() => {
    switch (this.store.status()) {
      case 'idle':
      case 'loading':
        return 'loading';
      case 'error':
        return 'error';
      case 'loaded': {
        if (this.store.total() === 0) return 'empty';
        if (this.mode() !== 'session') return null;
        // Par séance : on attend les premières fenêtres et l'index des séances pour regrouper.
        const head = this.store.head();
        return (head.ready || head.failed) && this.store.sessionsReady() ? null : 'loading';
      }
    }
  });

  protected readonly clearFilters: StateAction = {
    label: $localize`:Bouton de l'état vide filtré de la timeline@@timeline.empty.clear:Effacer les filtres`,
    handler: () => this.changeFilters(NO_FILTERS),
  };

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur de la timeline@@timeline.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };

  /** Total de la ligne d'état, au format de la langue (« 2 002 »). */
  protected readonly totalText = computed(() =>
    new Intl.NumberFormat(this.locale).format(this.store.total()),
  );

  protected readonly boundsText = computed(() => {
    const bounds = this.store.currentBounds();
    if (!bounds) return '';
    const newest = formatOccurred(bounds.newest, this.locale);
    const oldest = formatOccurred(bounds.oldest, this.locale);
    return $localize`:Bornes de la fenêtre courante de la timeline@@timeline.status.bounds:Fenêtre : ${oldest}:oldest: → ${newest}:newest:`;
  });

  protected readonly followStartText = computed(() => {
    const start = this.store.followStart();
    if (!start) return '';
    const date = new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(
      new Date(start),
    );
    return $localize`:Marqueur de début du suivi dans la timeline@@timeline.followStart:Début du suivi · ${date}:date:`;
  });

  protected readonly bandItems = computed(() =>
    this.store.bands().map((band) => ({ band, label: this.bandLabel(band.item) })),
  );

  protected readonly listLabel = $localize`:Nom de la liste des cartes de la timeline@@timeline.list:Entrées du patient, de la plus récente à la plus ancienne`;
  protected readonly zoomInLabel = $localize`:Bouton de zoom avant de la timeline@@timeline.zoomIn:Zoom avant (+)`;
  protected readonly zoomOutLabel = $localize`:Bouton de zoom arrière de la timeline@@timeline.zoomOut:Zoom arrière (−)`;
  protected readonly modeShortcutLabel = $localize`:Aide du raccourci de la bascule de mode de la timeline@@timeline.modeShortcut:Chronologique ou par séance`;
  protected readonly filtersShortcutLabel = $localize`:Aide du raccourci des filtres de la timeline@@timeline.filtersShortcut:Aller aux filtres de la timeline`;
  /** Nombre d'entrées regroupées au plus en mode par séance (trois fenêtres). */
  protected readonly headSize = new Intl.NumberFormat(this.locale).format(
    MAX_WINDOWS * WINDOW_SIZE,
  );

  /** `?focus=<entryId>` : entrée à amener à l'écran et à mettre en évidence (M4-08 → timeline). */
  private readonly focusParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(TIMELINE_FOCUS_PARAM))),
    { initialValue: null },
  );

  private lastWheel = 0;
  private restored = false;
  /** Position rangée au départ précédent (px), null sans reprise. */
  private restoreOffset: number | null = null;
  private lastOffset = 0;

  constructor() {
    // Le patient du dossier (en-tête) : la chronologie se charge, ou reprend l'état rangé.
    // Les filtres viennent de l'URL si elle en porte (lien partagé, rechargement), sinon de la
    // mémoire de l'onglet ; les fenêtres rangées ne sont reprises que pour les mêmes filtres.
    effect(() => {
      const patient = this.shell.patient();
      if (!patient) return;
      untracked(() => {
        if (this.store.patientId() === patient.id) return;
        const recalled = this.shell.recallTab<TimelineSnapshot>('timeline');
        const same = recalled?.patientId === patient.id ? recalled : undefined;
        const { offset, filters: ranged, ...snapshot } = same ?? ({} as Partial<TimelineSnapshot>);
        // `?focus=` seul (recherche → timeline) : on part sans filtre, pour que l'entrée soit dans
        // la plage ; les filtres de la mémoire de l'onglet pourraient l'exclure.
        const url = this.route.snapshot.queryParamMap;
        const focusOnly = url.has(TIMELINE_FOCUS_PARAM) && !hasFilterParams(url);
        this.filters.init(url, focusOnly ? null : (ranged ?? null));
        const reuse = !!same && sameFilters(ranged?.filters ?? NO_FILTERS, this.filters.filters());
        this.restoreOffset = reuse ? (offset ?? null) : null;
        if (!reuse) this.restored = true;
        this.sessionDetails.reset();
        void this.store.load(
          patient.id,
          patient.followedSince,
          reuse ? (snapshot as TimelineSnapshot) : undefined,
        );
        if (same && !reuse) this.store.setZoom(same.zoom);
        this.ready.set(true);
        // Repris : l'état ne vit plus que dans les stores (rangé à nouveau au départ).
        if (recalled) this.shell.rememberTab<TimelineSnapshot | undefined>('timeline', undefined);
      });
    });

    // Un seul sens de synchronisation : le TimelineFiltersStore réécrit l'URL (replaceUrl).
    effect(() => {
      const params = this.filters.params();
      if (!this.ready()) return;
      untracked(() => this.writeUrl(params));
    });

    // Retour sur l'onglet : la position de défilement rangée est rétablie une fois les lignes là
    // (sauf si ?focus= désigne une entrée : elle l'emporte).
    effect(() => {
      const viewport = this.viewport();
      const ready = this.store.status() === 'loaded' && this.store.total() > 0;
      if (!viewport || !ready || this.restored || this.focusParam()) return;
      if (untracked(() => this.mode()) !== 'chronological') return;
      this.restored = true;
      const anchor = untracked(() => this.store.anchor());
      const offset = this.restoreOffset;
      if (anchor > 0 || offset)
        afterNextRender(() => this.scrollTo(viewport, anchor, offset), { injector: this.injector });
    });

    // Position exacte, suivie au défilement, pour la reprendre au pixel près au retour sur l'onglet.
    effect((onCleanup) => {
      const viewport = this.viewport();
      if (!viewport) return;
      const subscription = viewport
        .elementScrolled()
        .subscribe(() => (this.lastOffset = viewport.measureScrollOffset('top')));
      onCleanup(() => subscription.unsubscribe());
    });

    // ?focus=<id> : la timeline lit ses fenêtres jusqu'à l'entrée, la met en haut de l'écran,
    // sélectionnée et avec le focus, puis retire le paramètre (la position reste dans l'onglet).
    // Par séance : la séance de l'entrée se déplie (repli sur le chronologique si elle n'est pas
    // dans les entrées regroupées).
    effect(() => {
      const id = this.focusParam();
      const ready = this.store.status() === 'loaded' && this.store.total() > 0;
      if (!id || !ready) return;
      if (this.mode() === 'session') {
        if (this.state() !== null || !this.sessionsView()) return;
        untracked(() => this.focusInSessions(id));
        return;
      }
      const viewport = this.viewport();
      if (!viewport) return;
      untracked(() => void this.focusEntry(id, viewport));
    });

    const destroyRef = inject(DestroyRef);

    // Haut de l'onglet dans le document (en-tête du dossier au-dessus) : la colonne de la timeline
    // prend la hauteur restante de la fenêtre. Relu quand la page change de taille.
    afterNextRender(() => {
      const host = this.host.nativeElement;
      const view = host.ownerDocument.defaultView;
      if (!view) return;
      const update = () => {
        const top = Math.round(host.getBoundingClientRect().top + view.scrollY);
        host.style.setProperty('--timeline-top', `${top}px`);
      };
      update();
      view.addEventListener('resize', update);
      const observer =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
      observer?.observe(host.ownerDocument.body);
      destroyRef.onDestroy(() => {
        view.removeEventListener('resize', update);
        observer?.disconnect();
      });
    });
    for (const [key, handler, label] of [
      ['+', () => this.zoom('in'), this.zoomInLabel],
      ['-', () => this.zoom('out'), this.zoomOutLabel],
      ['m', () => this.toggleMode(), this.modeShortcutLabel],
      ['f', () => this.toolbar().focus(), this.filtersShortcutLabel],
    ] as const) {
      destroyRef.onDestroy(this.shortcuts.register(key, handler, label));
    }

    // Départ de l'onglet : l'état (fenêtres, zoom, position) est rangé dans le shell (B2).
    destroyRef.onDestroy(() => {
      const snapshot = this.store.snapshot();
      if (snapshot) {
        this.shell.rememberTab<TimelineSnapshot>('timeline', {
          ...snapshot,
          offset: this.lastOffset,
          filters: this.filters.snapshot(),
        });
      }
    });
  }

  private focusing: string | null = null;

  private async focusEntry(id: string, viewport: CdkVirtualScrollViewport): Promise<void> {
    if (this.focusing === id) return;
    this.focusing = id;
    this.restored = true;
    const slot = await this.store.locate(id);
    if (slot === null && this.filters.active()) {
      // Les filtres excluent l'entrée : ils sont retirés (on prévient), la plage est relue et la
      // recherche de l'entrée reprend une fois la liste recréée (?focus= est toujours là).
      this.focusing = null;
      this.toasts.info(
        $localize`:Information quand les filtres excluaient l'entrée demandée@@timeline.focus.filtersCleared:Filtres retirés pour afficher l'entrée demandée.`,
      );
      this.changeFilters(NO_FILTERS);
      return;
    }
    if (slot !== null) {
      afterNextRender(
        () => {
          this.scrollTo(viewport, slot);
          this.onScrolled(slot);
          this.focusCard(viewport.elementRef.nativeElement, `article[data-entry-id="${id}"]`);
        },
        { injector: this.injector },
      );
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [TIMELINE_FOCUS_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.focusing = null;
  }

  /**
   * `?focus=` en mode par séance : la séance de l'entrée (ou la séance elle-même) se déplie, la carte
   * est sélectionnée et prend le focus. Hors des entrées regroupées, l'écran passe en chronologique
   * pour cette visite seulement (ni préférence, ni URL, ni mémoire de l'onglet) et y cherche
   * l'entrée.
   */
  private focusInSessions(id: string): void {
    if (this.focusing === id) return;
    const group = this.groups().find(
      (g) => g.id === id || g.entries.some((item) => item.id === id),
    );
    if (!group) {
      this.filters.overrideForVisit('chronological');
      return;
    }
    this.focusing = id;
    this.store.select(id);
    this.sessionsView()?.reveal(group.id);
    const host = this.host.nativeElement;
    const selector =
      group.id === id ? `[data-session-id="${id}"]` : `article[data-entry-id="${id}"]`;
    afterNextRender(
      () => {
        this.focusCard(host, selector, true);
        this.focusing = null;
      },
      { injector: this.injector },
    );
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [TIMELINE_FOCUS_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Donne le focus à la carte dès qu'elle est rendue (quelques trames au plus). */
  private focusCard(root: HTMLElement, selector: string, scroll = false, attempts = 20): void {
    const card = root.querySelector<HTMLElement>(selector);
    if (card) {
      if (scroll) card.scrollIntoView({ block: 'center' });
      card.focus({ preventScroll: true });
    } else if (attempts > 0) {
      requestAnimationFrame(() => this.focusCard(root, selector, scroll, attempts - 1));
    }
  }

  /** Réécrit les paramètres de filtre de l'URL s'ils ont changé (les autres restent). */
  private writeUrl(params: Record<string, string | string[] | null>): void {
    const current = this.router.parseUrl(this.router.url).queryParams as Record<
      string,
      string | string[] | undefined
    >;
    const changed = Object.entries(params).some(
      ([key, value]) => !sameParam(current[key] ?? null, value),
    );
    if (!changed) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Nouveaux filtres (puces, « Effacer les filtres ») : la plage filtrée est relue ; la liste
   * repart du haut (elle est recréée après le chargement, sans position à rétablir).
   */
  protected changeFilters(next: TimelineFilters): void {
    if (sameFilters(next, this.filters.filters())) return;
    this.filters.set(next);
    this.restored = true;
    void this.store.applyFilters();
  }

  /** Bascule Chronologique | Par séance (bouton, M) : la préférence est écrite. */
  protected async setMode(mode: TimelineMode): Promise<void> {
    if (mode === this.mode()) return;
    const problem = await this.filters.setMode(mode);
    if (problem) {
      this.toasts.show({
        level: 'warning',
        message: $localize`:Avertissement quand la préférence de mode n'a pas pu être enregistrée@@timeline.mode.notSaved:Mode appliqué à cet écran seulement : la préférence n'a pas pu être enregistrée.`,
      });
    }
  }

  protected toggleMode(): void {
    void this.setMode(this.mode() === 'session' ? 'chronological' : 'session');
  }

  /**
   * Amène le créneau `slot` en haut de l'écran. La hauteur totale du défilement n'est connue du CDK
   * qu'une trame après le rendu : on réessaie quelques trames tant que la position n'est pas atteinte.
   */
  private scrollTo(
    viewport: CdkVirtualScrollViewport,
    slot: number,
    offset: number | null = null,
    attempts = 10,
  ): void {
    viewport.checkViewportSize();
    const target = offset ?? slot * this.rowHeight();
    viewport.scrollToOffset(target);
    if (Math.abs(viewport.measureScrollOffset('top') - target) > 1 && attempts > 0) {
      requestAnimationFrame(() => this.scrollTo(viewport, slot, offset, attempts - 1));
    }
  }

  /** Défilement : la zone visible désigne la fenêtre courante (chargement des voisines). */
  protected onScrolled(first: number): void {
    const viewport = this.viewport();
    if (!viewport) return;
    const visibleRows = Math.ceil(viewport.getViewportSize() / this.rowHeight());
    this.store.visible(first, first + visibleRows);
  }

  /** `+` / `-` / boutons / Ctrl+molette : la granularité change, le haut de l'écran reste en place. */
  protected zoom(direction: 'in' | 'out'): void {
    if (this.mode() !== 'chronological') return;
    const viewport = this.viewport();
    const anchor = this.store.anchor();
    if (direction === 'in') this.store.zoomIn();
    else this.store.zoomOut();
    if (!viewport) return;
    afterNextRender(
      () => {
        this.scrollTo(viewport, anchor);
        this.onScrolled(anchor);
      },
      { injector: this.injector },
    );
  }

  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    const now = Date.now();
    if (now - this.lastWheel < WHEEL_STEP_MS) return;
    this.lastWheel = now;
    this.zoom(event.deltaY < 0 ? 'in' : 'out');
  }

  /** Ligne lue par les lecteurs d'écran : une carte, ou l'erreur de sa fenêtre. */
  protected announced(row: TimelineRow): boolean {
    return !!row.item || (row.state === 'error' && row.firstOfWindow);
  }

  private readonly retryActions = new Map<number, StateAction>();

  /** « Réessayer » d'une fenêtre en échec (même objet d'une détection à l'autre). */
  protected retryWindow(window: number): StateAction {
    let action = this.retryActions.get(window);
    if (!action) {
      action = { label: this.retry.label, handler: () => void this.store.retryWindow(window) };
      this.retryActions.set(window, action);
    }
    return action;
  }

  protected trackSlot(_index: number, row: TimelineRow): number {
    return row.slot;
  }

  protected axisLabel(row: TimelineRow): { main: string; sub: string } {
    return row.item
      ? groupLabel(
          row.item.occurred.from,
          row.item.occurred.precision,
          this.store.zoom(),
          this.locale,
        )
      : { main: '', sub: '' };
  }

  protected emotionLabel(item: TimelineItem): string | null {
    return item.emotion ? (this.store.emotionLabels()[item.emotion.code] ?? null) : null;
  }

  /** Clic, Entrée ou « Ouvrir » : l'entrée s'ouvre dans le panneau (fiche 05). */
  protected open(item: TimelineItem): void {
    this.edit(item);
  }

  /**
   * « Corriger » : l'éditeur s'ouvre sur l'entrée (une correction crée une version). La timeline
   * reste dessous, à sa position ; après un enregistrement, les fenêtres sont relues.
   */
  protected edit(item: TimelineItem): void {
    const patientId = this.store.patientId();
    if (!patientId) return;
    this.store.select(item.id);
    const ref = openEntryEditor(patientId, { entryId: item.id, injector: this.injector });
    void ref?.closed.then((saved) => {
      if (saved) this.reread();
    });
  }

  /** « Ouvrir » une séance du mode par séance : l'éditeur d'entrée sur la séance. */
  protected openSession(sessionId: string): void {
    const patientId = this.store.patientId();
    if (!patientId) return;
    const ref = openEntryEditor(patientId, { entryId: sessionId, injector: this.injector });
    void ref?.closed.then((saved) => {
      if (saved) this.reread();
    });
  }

  /**
   * « Lier » (menu, touche L sur une carte) : l'éditeur de lien (features/graph) s'ouvre sur
   * l'entrée, empilé sur l'éditeur d'entrée s'il est ouvert. À sa fermeture, la timeline relit ses
   * projections (nombre de liens des cartes) : on ne sait pas toujours si un lien a été posé (après
   * « … et lier une autre », le panneau se ferme sans résultat), on relit donc à chaque fermeture.
   */
  protected link(item: TimelineItem): void {
    this.store.select(item.id);
    const ref = openLinkEditor(item.id, {
      injector: this.injector,
      patientName: this.shell.patient()?.displayName ?? null,
    });
    // Un lien ne change que les projections de la chronologie (nombre de liens) : ni l'index des
    // séances, ni leur détail.
    void ref?.closed.then(() => this.store.refresh({ side: false }));
  }

  /** Après une écriture : on relit la chronologie et le détail des séances dépliées. */
  private reread(): void {
    void this.store.refresh();
    void this.sessionDetails.refresh();
  }

  /** « Voir dans le graphe » : onglet 3 centré sur l'entrée ; le retour retrouve la position. */
  protected showInGraph(item: TimelineItem): void {
    const patientId = this.store.patientId();
    if (!patientId) return;
    this.store.select(item.id);
    void this.router.navigate(['/patients', patientId, 'graph'], {
      queryParams: { root: item.id },
    });
  }

  private bandLabel(item: TimelineItem): string {
    const title = item.title ?? '';
    const when = formatOccurred(item.occurred, this.locale);
    return item.ongoing
      ? $localize`:Nom accessible d'une bande de situation en cours@@timeline.band.ongoing:Situation ${title}:title:, ${when}:when:, en cours`
      : $localize`:Nom accessible d'une bande de situation terminée@@timeline.band.closed:Situation ${title}:title:, ${when}:when:, terminée`;
  }
}
