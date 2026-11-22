import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarOptions, EventInput, EventMountArg, MoreLinkArg } from '@fullcalendar/core';

import { AgendaHours, Appointment, BusyBlock, fromIsoDay, rangeFor } from '../data/agenda.model';
import {
  guestAppointmentOf,
  onlineRequestOf,
  PURGED_GUEST,
  weekAgenda,
} from '../testing/agenda.testing';
import { AgendaCalendarComponent } from './agenda-calendar.component';

const week = weekAgenda(rangeFor('week', fromIsoDay('2026-10-26')!));
const busy: BusyBlock[] = [
  {
    id: 'b-1',
    calendar: 'Google Pro',
    startsAt: new Date(2026, 9, 26, 14, 0).toISOString(),
    endsAt: new Date(2026, 9, 26, 16, 0).toISOString(),
  },
];

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** FullCalendar rend après le cycle Angular : on attend que le DOM attendu apparaisse. */
async function waitFor(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ready(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(ready()).toBe(true);
}

async function render(
  selectedId: string | null = null,
  hours?: AgendaHours,
  appointments: readonly Appointment[] = week.appointments,
) {
  TestBed.configureTestingModule({
    imports: [AgendaCalendarComponent],
    providers: [provideRouter([]), { provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(AgendaCalendarComponent);
  fixture.componentRef.setInput('view', 'week');
  fixture.componentRef.setInput('anchor', fromIsoDay('2026-10-26')!);
  fixture.componentRef.setInput('appointments', appointments);
  fixture.componentRef.setInput('busy', busy);
  fixture.componentRef.setInput('selectedId', selectedId);
  if (hours) fixture.componentRef.setInput('hours', hours);
  await fixture.whenStable();
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as {
    events: () => EventInput[];
    options: () => CalendarOptions;
  };
  return {
    fixture,
    events: component.events(),
    options: () => component.options(),
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('AgendaCalendarComponent (FullCalendar)', () => {
  it('traduit les rendez-vous en événements liés et les indisponibilités en événements de fond', async () => {
    const { events } = await render('rdv-2026-10-31-13');
    const appointments = events.filter((item) => item.display !== 'background');
    const background = events.filter((item) => item.display === 'background');
    expect(appointments).toHaveLength(14);
    expect(background).toHaveLength(1);

    const marie = appointments.find((item) => item.id === 'rdv-2026-10-31-13')!;
    expect(marie.url).toBe('/agenda/rdv/rdv-2026-10-31-13');
    expect(marie.classNames).toEqual(['rdv', 'in_person', 'planned', 'selected']);
    expect(marie.extendedProps).toMatchObject({
      kind: 'appointment',
      name: 'Marie D.',
      suffix: null,
      modality: 'cabinet',
      time: '10:00–10:50',
      startTime: '10:00',
    });

    const lea = appointments.find((item) => item.title === 'Léa T.')!;
    expect(lea.classNames).toEqual(['rdv', 'video', 'planned']);
    expect(lea.extendedProps).toMatchObject({ suffix: 'visio', suffixKind: 'modality' });

    const yanis = appointments.find((item) => item.title === 'Yanis M.')!;
    expect(yanis.classNames).toContain('tentative');
    expect(yanis.extendedProps).toMatchObject({ suffix: 'à confirmer', suffixKind: 'status' });

    // Un rendez-vous téléphonique reste un rendez-vous : couleur téléphone, heures complètes.
    const ines = appointments.find((item) => item.title === 'Inès V.')!;
    expect(ines.classNames).toEqual(['rdv', 'phone', 'planned']);
    expect(ines.extendedProps).toMatchObject({ name: 'Inès V.', time: '15:00–15:15' });

    expect(background[0]).toMatchObject({
      display: 'background',
      editable: false,
      overlap: false,
      classNames: ['busy'],
    });
    expect(background[0].extendedProps).toMatchObject({
      kind: 'busy',
      busyTitle: 'Occupé · Google Pro',
      time: '14:00 – 16:00',
      name: 'Indisponible de 14:00 à 16:00, agenda Google Pro',
    });
  });

  it('« + n autres » demande le jour à la page ; seuls planifiés et à confirmer bougent', async () => {
    const { fixture, options, events } = await render(null);
    const picked: Date[] = [];
    fixture.componentInstance.dayPicked.subscribe((date) => picked.push(date));
    const more = options().moreLinkClick as (arg: MoreLinkArg) => unknown;
    const date = fromIsoDay('2026-10-27')!;
    expect(more({ date } as MoreLinkArg)).toBeUndefined();
    expect(picked).toEqual([date]);

    const allow = options().eventAllow!;
    const byTitle = (title: string) =>
      ({ extendedProps: events.find((item) => item.title === title)!.extendedProps }) as never;
    expect(allow({} as never, byTitle('Omar B.'))).toBe(true);
    expect(allow({} as never, byTitle('Yanis M.'))).toBe(true);
    expect(allow({} as never, { extendedProps: { kind: 'busy' } } as never)).toBe(false);
  });

  it('préférences agenda.* : bornes de la grille, jours travaillés hachurés et week-end teinté', async () => {
    const defaults = await render(null);
    expect(defaults.options()).toMatchObject({
      slotMinTime: '08:00:00',
      slotMaxTime: '19:00:00',
      businessHours: { daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: '08:00:00', endTime: '19:00:00' },
    });
    TestBed.resetTestingModule();

    const { options, fixture } = await render(null, {
      dayStartHour: 10,
      dayEndHour: 18,
      workingDays: [1, 2, 3, 4, 7],
    });
    const before = options();
    expect(before).toMatchObject({ slotMinTime: '10:00:00', slotMaxTime: '18:00:00' });
    expect(before.businessHours).toMatchObject({ daysOfWeek: [1, 2, 3, 4, 0] });
    const classes = before.dayCellClassNames as (arg: { dow: number }) => string[];
    expect(classes({ dow: 6 })).toEqual(['pm-off']);
    expect(classes({ dow: 0 })).toEqual(['pm-weekend-worked']);
    expect(classes({ dow: 1 })).toEqual([]);
    // La base (vue, date, rappels) reste la même : seules les options des préférences changent.
    fixture.componentRef.setInput('hours', {
      dayStartHour: 7,
      dayEndHour: 20,
      workingDays: [1, 2, 3, 4, 5],
    });
    const after = options();
    expect(after.slotMinTime).toBe('07:00:00');
    expect(after.eventClick).toBe(before.eventClick);
  });

  it('rendez-vous invité : « Prénom Nom » ou « Invité purgé » ; le double-clic n’ouvre aucun dossier', async () => {
    const guest = guestAppointmentOf({
      id: 'invite',
      startsAt: new Date(2026, 9, 27, 14, 0).toISOString(),
      modality: 'video',
    });
    const purged = guestAppointmentOf({
      id: 'purge',
      startsAt: new Date(2026, 9, 28, 9, 0).toISOString(),
      guest: PURGED_GUEST,
    });
    const { fixture, events, options } = await render(null, undefined, [
      ...week.appointments,
      guest,
      purged,
    ]);
    const sara = events.find((item) => item.id === 'invite')!;
    expect(sara.title).toBe('Sara Benali');
    expect(sara.url).toBe('/agenda/rdv/invite');
    expect(sara.extendedProps).toMatchObject({ name: 'Sara Benali', suffix: 'visio' });
    expect(events.find((item) => item.id === 'purge')!.title).toBe('Invité purgé');

    const opened: Appointment[] = [];
    fixture.componentInstance.opened.subscribe((item) => opened.push(item));
    const mount = options().eventDidMount as (arg: EventMountArg) => void;
    const dblclick = (event: EventInput) => {
      const el = document.createElement('a');
      mount({ el, event: { classNames: [], extendedProps: event.extendedProps } } as never);
      el.dispatchEvent(new MouseEvent('dblclick'));
    };
    dblclick(sara);
    expect(opened).toEqual([]);
    dblclick(events.find((item) => item.title === 'Omar B.')!);
    expect(opened.map((item) => item.patient?.displayName)).toEqual(['Omar B.']);
  });

  it('demande en ligne : classe origin-online et mention ; un « à confirmer » du praticien n’en a pas', async () => {
    const request = onlineRequestOf({
      id: 'demande',
      startsAt: new Date(2026, 9, 29, 10, 0).toISOString(),
      durationMin: 60,
    });
    const confirmed = onlineRequestOf({
      id: 'confirmee',
      startsAt: new Date(2026, 9, 28, 16, 0).toISOString(),
      status: 'planned',
    });
    const { events, el, fixture } = await render(null, undefined, [
      ...week.appointments,
      request,
      confirmed,
    ]);
    const pending = events.find((item) => item.id === 'demande')!;
    expect(pending.classNames).toEqual(['rdv', 'in_person', 'tentative', 'origin-online']);
    expect(pending.extendedProps).toMatchObject({
      online: true,
      suffix: 'à confirmer',
      name: 'Sara Benali',
    });
    const planned = events.find((item) => item.id === 'confirmee')!;
    expect(planned.classNames).toEqual(['rdv', 'in_person', 'planned', 'origin-online']);
    expect(planned.extendedProps).toMatchObject({ online: true });
    const yanis = events.find((item) => item.title === 'Yanis M.')!;
    expect(yanis.classNames).not.toContain('origin-online');
    expect(yanis.extendedProps).toMatchObject({ online: false, suffixKind: 'status' });

    // Rendu (FullCalendar dessine aussi sous jsdom) : la mention est un texte dans le lien, avec
    // un globe décoratif ; jamais sur un rendez-vous posé par le praticien.
    const link = (id: string) =>
      el.querySelector<HTMLAnchorElement>(`a.fc-event[href="/agenda/rdv/${id}"]`)!;
    await waitFor(() => link('demande') !== null);
    for (const id of ['demande', 'confirmee']) {
      const mark = link(id).querySelector('.online-mark')!;
      expect(text(mark)).toBe('Demande en ligne');
      expect(mark.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
      expect(text(link(id))).toContain('Demande en ligne');
    }
    const ownTentative = el.querySelector('a.fc-event.tentative:not(.origin-online)')!;
    expect(text(ownTentative)).toContain('Yanis M.');
    expect(ownTentative.querySelector('.online-mark')).toBeNull();

    // Vue Liste : la mention en texte (pastille) après le statut.
    fixture.componentRef.setInput('view', 'list');
    await waitFor(() => el.querySelector('.fc-list-event') !== null);
    const row = [...el.querySelectorAll('.fc-list-event')].find((item) =>
      text(item).includes('Sara Benali cabinet · à confirmer'),
    );
    expect(text(row?.querySelector('.list-meta .online-pill'))).toBe('Demande en ligne');
    expect(
      [...el.querySelectorAll('.fc-list-event')].filter((item) =>
        item.querySelector('.online-pill'),
      ),
    ).toHaveLength(2);

    // Vue Mois : le globe seul, nommé pour le lecteur d'écran.
    fixture.componentRef.setInput('view', 'month');
    await waitFor(() => el.querySelector('.fc-daygrid-event') !== null);
    const chip = el.querySelector<HTMLElement>('a.fc-daygrid-event.origin-online')!;
    expect(chip.querySelector('svg.globe')!.getAttribute('aria-hidden')).toBe('true');
    expect(text(chip)).toContain('· Demande en ligne');
    expect(text(chip.querySelector('.sr-only:last-child'))).toBe('· Demande en ligne');
  });

  it('sans sélection, aucun événement ne porte la classe selected ; le calendrier est monté', async () => {
    const { events, el } = await render(null);
    expect(events.some((item) => item.classNames?.includes('selected'))).toBe(false);
    expect(el.querySelector('full-calendar')).not.toBeNull();
  });
});
