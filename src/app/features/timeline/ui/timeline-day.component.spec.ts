import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Occurred } from '../../../shared/util';
import { TimelineZoom } from '../data/timeline.model';
import { TimelineDayComponent } from './timeline-day.component';

@Component({
  imports: [TimelineDayComponent],
  template: `<pm-timeline-day
    [occurred]="occurred()"
    [zoom]="zoom()"
    [session]="session()"
    [today]="today"
    [narrow]="narrow()"
  />`,
})
class HostComponent {
  readonly occurred = signal<Occurred>({ from: '2026-11-12T12:00:00Z', precision: 'exact' });
  readonly zoom = signal<TimelineZoom>('day');
  readonly session = signal(false);
  readonly narrow = signal(false);
  readonly today = new Date(2026, 10, 12, 18, 0);
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const read = () => ({
    main: (el.querySelector('b')?.textContent ?? '').trim(),
    sub: (el.querySelector('.date span')?.textContent ?? '').trim(),
    head: (el.querySelector('.day-head')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  });
  return { fixture, host: fixture.componentInstance, read };
}

describe('TimelineDayComponent', () => {
  it('« Jeudi 12 » et « aujourd’hui », « hier », « il y a 4 j », « séance », puis rien', async () => {
    const { read, host, fixture } = await render();
    expect(read()).toMatchObject({ main: 'Jeudi 12', sub: "aujourd'hui" });
    host.occurred.set({ from: '2026-11-11T12:00:00Z', precision: 'exact' });
    await fixture.whenStable();
    expect(read()).toMatchObject({ main: 'Mercredi 11', sub: 'hier' });
    host.occurred.set({ from: '2026-11-08T12:00:00Z', precision: 'exact' });
    await fixture.whenStable();
    expect(read()).toMatchObject({ main: 'Dimanche 8', sub: 'il y a 4 j' });
    host.occurred.set({ from: '2026-11-05T12:00:00Z', precision: 'exact' });
    host.session.set(true);
    await fixture.whenStable();
    expect(read()).toMatchObject({ main: 'Jeudi 5', sub: 'séance' });
    host.session.set(false);
    host.occurred.set({ from: '2026-11-02T12:00:00Z', precision: 'exact' });
    await fixture.whenStable();
    expect(read()).toMatchObject({ main: 'Lundi 2', sub: '' });
  });

  it('précision : jour en UTC, mois, année, phase de vie avec son libellé', async () => {
    const { read, host, fixture } = await render((h) =>
      h.occurred.set({ from: '2026-10-15T00:00:00Z', precision: 'day' }),
    );
    expect(read().main).toBe('Jeudi 15');
    host.occurred.set({ from: '2026-10-01T00:00:00Z', precision: 'month' });
    await fixture.whenStable();
    expect(read().main).toBe('Octobre 2026');
    host.occurred.set({ from: '2014-01-01T00:00:00Z', precision: 'year' });
    await fixture.whenStable();
    expect(read().main).toBe('2014');
    host.occurred.set({
      from: '2001-01-01T00:00:00Z',
      to: '2005-12-31T00:00:00Z',
      precision: 'life_phase',
      label: 'Collège',
    });
    await fixture.whenStable();
    expect(read().main).toBe('Collège');
    expect(read().sub).toContain('2001');
  });

  it('zoom semaine et mois', async () => {
    const { read, host, fixture } = await render((h) => h.zoom.set('week'));
    expect(read().main).toBe('Sem. du 9 nov.');
    host.zoom.set('month');
    await fixture.whenStable();
    expect(read()).toMatchObject({ main: 'Novembre', sub: '2026' });
  });

  it('téléphone : un en-tête au-dessus des lignes, « JEUDI 12 · AUJOURD’HUI » par la feuille de style', async () => {
    const { read } = await render((h) => h.narrow.set(true));
    expect(read().head).toBe("Jeudi 12 · aujourd'hui");
  });
});
