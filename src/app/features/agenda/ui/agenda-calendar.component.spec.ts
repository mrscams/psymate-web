import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarOptions, EventInput, MoreLinkArg } from '@fullcalendar/core';

import { demoAgenda } from '../data/agenda.fixtures';
import { fromIsoDay, rangeFor } from '../data/agenda.model';
import { AgendaCalendarComponent } from './agenda-calendar.component';

const week = demoAgenda(rangeFor('week', fromIsoDay('2026-10-26')!));

async function render(selectedId: string | null = null) {
  TestBed.configureTestingModule({
    imports: [AgendaCalendarComponent],
    providers: [provideRouter([]), { provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(AgendaCalendarComponent);
  fixture.componentRef.setInput('view', 'week');
  fixture.componentRef.setInput('anchor', fromIsoDay('2026-10-26')!);
  fixture.componentRef.setInput('appointments', week.appointments);
  fixture.componentRef.setInput('busy', week.busy);
  fixture.componentRef.setInput('selectedId', selectedId);
  await fixture.whenStable();
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as {
    events: () => EventInput[];
    options: CalendarOptions;
  };
  return {
    fixture,
    events: component.events(),
    options: component.options,
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('AgendaCalendarComponent (FullCalendar)', () => {
  it('traduit les 14 séances en événements liés et les 3 blocs Google en événements de fond', async () => {
    const { events } = await render('rdv-2026-10-31-13');
    const appointments = events.filter((item) => item.display !== 'background');
    const busy = events.filter((item) => item.display === 'background');
    expect(appointments).toHaveLength(14);
    expect(busy).toHaveLength(3);

    const marie = appointments.find((item) => item.id === 'rdv-2026-10-31-13')!;
    expect(marie.url).toBe('/agenda/rdv/rdv-2026-10-31-13');
    expect(marie.classNames).toEqual(['rdv', 'in_person', 'planned', 'session', 'selected']);
    expect(marie.extendedProps).toMatchObject({
      kind: 'appointment',
      name: 'Marie D.',
      suffix: null,
      modality: 'cabinet',
      time: '10:00–10:50',
      startTime: '10:00',
      contact: false,
    });

    const lea = appointments.find((item) => item.title === 'Léa T.')!;
    expect(lea.classNames).toEqual(['rdv', 'video', 'planned', 'session']);
    expect(lea.extendedProps).toMatchObject({ suffix: 'visio', suffixKind: 'modality' });

    const yanis = appointments.find((item) => item.title === 'Yanis M.')!;
    expect(yanis.classNames).toContain('tentative');
    expect(yanis.extendedProps).toMatchObject({ suffix: 'à confirmer', suffixKind: 'status' });

    const ines = appointments.find((item) => item.title === 'Inès V.')!;
    expect(ines.classNames).toContain('contact');
    expect(ines.extendedProps).toMatchObject({ name: 'Appel · Inès V.', time: '15:00' });

    expect(busy[0]).toMatchObject({
      display: 'background',
      editable: false,
      overlap: false,
      classNames: ['busy', 'google-pro'],
    });
    expect(busy[0].extendedProps).toMatchObject({
      kind: 'busy',
      busyTitle: 'Occupé · Google Pro',
      time: '14:00 – 16:00',
      name: 'Indisponible de 14:00 à 16:00, agenda Google Pro',
    });
  });

  it('« + n autres » du mois demande le jour à la page (dayPicked) au lieu de changer de vue en interne ; seules les séances planifiées ou à confirmer bougent', async () => {
    const { fixture, options, events } = await render(null);
    const picked: Date[] = [];
    fixture.componentInstance.dayPicked.subscribe((date) => picked.push(date));
    const more = options.moreLinkClick as (arg: MoreLinkArg) => unknown;
    const date = fromIsoDay('2026-10-27')!;
    expect(more({ date } as MoreLinkArg)).toBeUndefined();
    expect(picked).toEqual([date]);

    const allow = options.eventAllow!;
    const byTitle = (title: string) =>
      ({ extendedProps: events.find((item) => item.title === title)!.extendedProps }) as never;
    expect(allow({} as never, byTitle('Omar B.'))).toBe(true);
    expect(allow({} as never, byTitle('Yanis M.'))).toBe(true);
    expect(allow({} as never, { extendedProps: { kind: 'busy' } } as never)).toBe(false);
  });

  it('sans sélection, aucun événement ne porte la classe selected ; le calendrier est monté', async () => {
    const { events, el } = await render(null);
    expect(events.some((item) => item.classNames?.includes('selected'))).toBe(false);
    expect(el.querySelector('full-calendar')).not.toBeNull();
  });
});
