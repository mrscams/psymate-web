import {
  CdkVirtualScrollViewport,
  VIRTUAL_SCROLL_STRATEGY,
  VirtualScrollStrategy,
} from '@angular/cdk/scrolling';
import { Directive, effect, forwardRef, input } from '@angular/core';
import { distinctUntilChanged, Subject } from 'rxjs';

import { indexAtOffset } from '../data/timeline-layout.model';

/**
 * Défilement virtuel à hauteurs connues (UX-S9) : chaque ligne du flux a sa hauteur, calculée avant
 * le rendu par la mise en page (data/timeline-layout.model), et l'on connaît le décalage cumulé de
 * chacune. Quand des hauteurs changent (une fenêtre arrive, un compte rendu est lu, le zoom change),
 * la première ligne visible garde sa place à l'écran : rien ne saute au-dessus du praticien.
 */
export class RowOffsetsStrategy implements VirtualScrollStrategy {
  private readonly index = new Subject<number>();
  readonly scrolledIndexChange = this.index.pipe(distinctUntilChanged());

  private viewport: CdkVirtualScrollViewport | null = null;
  private offsets: readonly number[] = [0];

  constructor(private buffer = 480) {}

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.update();
  }

  detach(): void {
    this.viewport = null;
  }

  /** Nouvelles hauteurs : la ligne en haut de l'écran reste où elle est. */
  setOffsets(offsets: readonly number[], buffer = this.buffer): void {
    const viewport = this.viewport;
    const previous = this.offsets;
    this.offsets = offsets.length ? offsets : [0];
    this.buffer = buffer;
    if (viewport && previous.length > 1) {
      const top = viewport.measureScrollOffset('top');
      if (top > 0) {
        const first = indexAtOffset(previous, top);
        const within = top - previous[first];
        const moved = (this.offsets[Math.min(first, this.offsets.length - 1)] ?? 0) + within;
        if (Math.abs(moved - top) > 0.5) {
          viewport.setTotalContentSize(this.total());
          viewport.scrollToOffset(moved);
        }
      }
    }
    this.update();
  }

  /** Décalage du haut de la ligne `index`. */
  offsetOf(index: number): number {
    const last = this.offsets.length - 1;
    return this.offsets[Math.max(0, Math.min(index, last))] ?? 0;
  }

  /** Rang de la ligne au décalage donné. */
  indexAt(offset: number): number {
    return indexAtOffset(this.offsets, offset);
  }

  onContentScrolled(): void {
    this.update();
  }

  onDataLengthChanged(): void {
    this.update();
  }

  onContentRendered(): void {
    /* rien : les hauteurs sont connues d'avance */
  }

  onRenderedOffsetChanged(): void {
    /* rien */
  }

  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    this.viewport?.scrollToOffset(this.offsetOf(index), behavior);
  }

  private total(): number {
    return this.offsets[this.offsets.length - 1] ?? 0;
  }

  private update(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    viewport.setTotalContentSize(this.total());
    const count = Math.min(this.offsets.length - 1, viewport.getDataLength());
    if (count <= 0) {
      viewport.setRenderedRange({ start: 0, end: 0 });
      viewport.setRenderedContentOffset(0);
      return;
    }
    const top = viewport.measureScrollOffset('top');
    const size = viewport.getViewportSize();
    const start = Math.min(indexAtOffset(this.offsets, Math.max(0, top - this.buffer)), count - 1);
    const end = Math.min(count, indexAtOffset(this.offsets, top + size + this.buffer) + 1);
    viewport.setRenderedRange({ start, end: Math.max(end, start + 1) });
    viewport.setRenderedContentOffset(this.offsets[start] ?? 0);
    this.index.next(Math.min(indexAtOffset(this.offsets, top), count - 1));
  }
}

/**
 * `<cdk-virtual-scroll-viewport [pmRowOffsets]="offsets">` : le viewport défile sur les décalages
 * cumulés de la mise en page (remplace `itemSize`, réservé aux lignes de hauteur égale).
 */
@Directive({
  selector: 'cdk-virtual-scroll-viewport[pmRowOffsets]',
  providers: [
    {
      provide: VIRTUAL_SCROLL_STRATEGY,
      useFactory: (directive: RowOffsetsDirective) => directive.strategy,
      deps: [forwardRef(() => RowOffsetsDirective)],
    },
  ],
})
export class RowOffsetsDirective {
  readonly offsets = input.required<readonly number[]>({ alias: 'pmRowOffsets' });
  readonly strategy = new RowOffsetsStrategy();

  constructor() {
    effect(() => this.strategy.setOffsets(this.offsets()));
  }
}
