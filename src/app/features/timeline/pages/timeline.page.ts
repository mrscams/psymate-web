import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  afterNextRender,
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
import { MatMenuModule } from '@angular/material/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { ShortcutService } from '../../../core/shortcuts';
import { EntryIconComponent, StateAction, StateComponent } from '../../../shared/ui';
import { formatOccurred, StateKind } from '../../../shared/util';
import { openEntryEditor } from '../../entries';
import { PatientShellStore } from '../../patient-shell';
import { ROW_HEIGHT, TimelineItem, TimelineRow, TimelineSnapshot } from '../data/timeline.model';
import { TimelineStore } from '../data/timeline.store';
import { TIMELINE_FOCUS_PARAM } from '../timeline.params';
import { TimelineCardComponent } from '../ui/timeline-card.component';
import { groupLabel, zoomLabel } from '../ui/timeline-labels';

/** Délai minimal entre deux crans de zoom à la molette (un geste = un cran). */
const WHEEL_STEP_MS = 180;

/**
 * Onglet 2 du dossier, /patients/:id/timeline, mode chronologique (fiche 03, état A ; B4 écran 3) :
 * axe vertical, cartes par type, bandes des situations qui chevauchent la plage, zone « Avant le
 * suivi », défilement virtuel CDK sur toute la liste (créneaux vides hors des trois fenêtres en
 * mémoire), zoom `Ctrl+molette`, `+`, `-` sans requête tant que les fenêtres couvrent, menu
 * contextuel au clavier. Filtres et mode par séance : M3-03 ; vue décennie : M3-04.
 */
@Component({
  selector: 'pm-timeline-page',
  imports: [
    EntryIconComponent,
    MatMenuModule,
    ScrollingModule,
    StateComponent,
    TimelineCardComponent,
  ],
  providers: [TimelineStore],
  templateUrl: './timeline.page.html',
  styleUrl: './timeline.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePage {
  protected readonly store = inject(TimelineStore);
  private readonly shell = inject(PatientShellStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly shortcuts = inject(ShortcutService);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);

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
      case 'loaded':
        return this.store.total() === 0 ? 'empty' : null;
    }
  });

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur de la timeline@@timeline.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };

  protected readonly countText = computed(() => {
    const total = this.store.total();
    const windows = this.store.inMemory();
    return $localize`:Ligne d'état de la timeline@@timeline.status.count:${total}:total: entrées · ${windows}:windows: fenêtres en mémoire`;
  });

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

  /** `?focus=<entryId>` : entrée à amener à l'écran et à mettre en évidence (M4-08 → timeline). */
  private readonly focusParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(TIMELINE_FOCUS_PARAM))),
    { initialValue: null },
  );

  private lastWheel = 0;
  private restored = false;

  constructor() {
    // Le patient du dossier (en-tête) : la chronologie se charge, ou reprend l'état rangé.
    effect(() => {
      const patient = this.shell.patient();
      if (!patient) return;
      untracked(() => {
        if (this.store.patientId() === patient.id) return;
        const snapshot = this.shell.recallTab<TimelineSnapshot>('timeline');
        void this.store.load(patient.id, patient.followedSince, snapshot);
      });
    });

    // Retour sur l'onglet : la position de défilement rangée est rétablie une fois les lignes là
    // (sauf si ?focus= désigne une entrée : elle l'emporte).
    effect(() => {
      const viewport = this.viewport();
      const ready = this.store.status() === 'loaded' && this.store.total() > 0;
      if (!viewport || !ready || this.restored || this.focusParam()) return;
      this.restored = true;
      const anchor = untracked(() => this.store.anchor());
      if (anchor > 0)
        afterNextRender(() => this.scrollTo(viewport, anchor), { injector: this.injector });
    });

    // ?focus=<id> : la timeline lit ses fenêtres jusqu'à l'entrée, la met en haut de l'écran,
    // sélectionnée et avec le focus, puis retire le paramètre (la position reste dans l'onglet).
    effect(() => {
      const id = this.focusParam();
      const viewport = this.viewport();
      const ready = this.store.status() === 'loaded' && this.store.total() > 0;
      if (!id || !viewport || !ready) return;
      untracked(() => void this.focusEntry(id, viewport));
    });

    const destroyRef = inject(DestroyRef);
    for (const [key, handler, label] of [
      ['+', () => this.zoom('in'), this.zoomInLabel],
      ['-', () => this.zoom('out'), this.zoomOutLabel],
    ] as const) {
      destroyRef.onDestroy(this.shortcuts.register(key, handler, label));
    }

    // Départ de l'onglet : l'état (fenêtres, zoom, position) est rangé dans le shell (B2).
    destroyRef.onDestroy(() => {
      const snapshot = this.store.snapshot();
      if (snapshot) this.shell.rememberTab<TimelineSnapshot>('timeline', snapshot);
    });
  }

  private focusing: string | null = null;

  private async focusEntry(id: string, viewport: CdkVirtualScrollViewport): Promise<void> {
    if (this.focusing === id) return;
    this.focusing = id;
    this.restored = true;
    const slot = await this.store.locate(id);
    if (slot !== null) {
      afterNextRender(
        () => {
          this.scrollTo(viewport, slot);
          this.onScrolled(slot);
          this.focusCard(viewport, id);
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

  /** Donne le focus à la carte de l'entrée dès qu'elle est rendue (quelques trames au plus). */
  private focusCard(viewport: CdkVirtualScrollViewport, id: string, attempts = 20): void {
    const card = viewport.elementRef.nativeElement.querySelector<HTMLElement>(
      `article[data-entry-id="${id}"]`,
    );
    if (card) card.focus({ preventScroll: true });
    else if (attempts > 0) requestAnimationFrame(() => this.focusCard(viewport, id, attempts - 1));
  }

  /**
   * Amène le créneau `slot` en haut de l'écran. La hauteur totale du défilement n'est connue du CDK
   * qu'une trame après le rendu : on réessaie quelques trames tant que la position n'est pas atteinte.
   */
  private scrollTo(viewport: CdkVirtualScrollViewport, slot: number, attempts = 10): void {
    viewport.checkViewportSize();
    viewport.scrollToIndex(slot);
    const target = slot * this.rowHeight();
    if (Math.abs(viewport.measureScrollOffset('top') - target) > 1 && attempts > 0) {
      requestAnimationFrame(() => this.scrollTo(viewport, slot, attempts - 1));
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
      if (saved) void this.store.refresh();
    });
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
