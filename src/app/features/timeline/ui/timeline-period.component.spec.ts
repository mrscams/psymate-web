import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NO_FILTERS, TimelineFilters, withPeriod } from '../data/timeline-filters.model';
import { TimelinePeriodComponent } from './timeline-period.component';

const TODAY = new Date(2026, 10, 8, 14);

@Component({
  imports: [TimelinePeriodComponent],
  template: `
    <pm-timeline-period
      [filters]="filters()"
      [today]="today"
      (filtersChange)="changes.push($event); filters.set($event)"
    />
  `,
})
class HostComponent {
  readonly filters = signal<TimelineFilters>(withPeriod(NO_FILTERS, '90d', TODAY));
  readonly today = TODAY;
  readonly changes: TimelineFilters[] = [];
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => [
    ...el.querySelectorAll<HTMLButtonElement>('[aria-label="Période"] button'),
  ];
  return { fixture, host: fixture.componentInstance, el, buttons };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelinePeriodComponent', () => {
  it('groupe segmenté 30 j | 90 j | 1 an | Tout ; 90 j actif par défaut ; forme longue en description', async () => {
    const { buttons } = await render();
    expect(buttons().map(text)).toEqual(['30 j', '90 j', '1 an', 'Tout']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(buttons()[1].getAttribute('title')).toBe('90 derniers jours');
  });

  it('choisir « Tout » puis « 30 j » : la période suit, le reste des filtres aussi', async () => {
    const { fixture, host, buttons } = await render((h) =>
      h.filters.set({ ...withPeriod(NO_FILTERS, '90d', TODAY), draftsOnly: true }),
    );
    buttons()[3].click();
    await fixture.whenStable();
    expect(host.changes.at(-1)).toMatchObject({ from: null, to: null, draftsOnly: true });
    buttons()[0].click();
    await fixture.whenStable();
    expect(host.changes.at(-1)).toMatchObject({ from: '2026-10-09', to: null });
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    // La période active ne réémet rien.
    buttons()[0].click();
    expect(host.changes).toHaveLength(2);
  });

  it('période libre (URL, mois ouvert) : ses bornes affichées, aucun bouton actif', async () => {
    const { el, buttons } = await render((host) =>
      host.filters.set({ ...NO_FILTERS, from: '2026-01-01', to: '2026-03-31' }),
    );
    expect(text(el.querySelector('.custom'))).toBe('Du 1 janv. 2026 au 31 mars 2026');
    expect(buttons().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
  });
});
