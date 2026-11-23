import { Component, input, LOCALE_ID, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService, ToastService } from '../../../shared/ui';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaApi } from '../data/agenda.api';
import {
  AgendaHours,
  AgendaRange,
  AgendaView,
  Appointment,
  BusyBlock,
  CreatedAppointments,
} from '../data/agenda.model';
import {
  appointmentOf,
  guestAppointmentOf,
  onlineRequestOf,
  weekAgenda,
} from '../testing/agenda.testing';
import { NewAppointmentData } from '../panels/new-appointment.panel';
import { AgendaCalendarComponent, Rescheduled } from '../ui/agenda-calendar.component';
import { AgendaPage } from './agenda.page';

@Component({ selector: 'pm-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

/**
 * Doublure de pm-agenda-calendar : FullCalendar mesure le DOM, ce que jsdom ne fait pas. Elle expose
 * ce que la page lui donne (vue, date, rendez-vous, sélection, bornes) et ses sorties par des boutons.
 */
@Component({
  selector: 'pm-agenda-calendar',
  template: `
    <div
      class="stub"
      [attr.data-view]="view()"
      [attr.data-anchor]="anchor().getDate()"
      [attr.data-count]="appointments().length"
      [attr.data-selected]="selectedId()"
      [attr.data-start-hour]="hours().dayStartHour"
    ></div>
    @for (item of appointments(); track item.id) {
      <a class="event" [class.selected]="item.id === selectedId()" (dblclick)="opened.emit(item)">
        {{ item.patient?.displayName ?? item.guest?.lastName }}
      </a>
    }
    <button type="button" class="slot" (click)="slotPicked.emit(anchor())">créneau</button>
    <button type="button" class="day" (click)="dayPicked.emit(anchor())">jour</button>
    <button
      type="button"
      class="move"
      (click)="
        rescheduled.emit({
          id: appointments()[0].id,
          startsAt: '2026-10-26T12:00:00.000Z',
          endsAt: '2026-10-26T13:20:00.000Z',
        })
      "
    >
      déplacer
    </button>
  `,
})
class StubCalendar {
  readonly view = input.required<AgendaView>();
  readonly anchor = input.required<Date>();
  readonly appointments = input.required<readonly Appointment[]>();
  readonly busy = input<readonly BusyBlock[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly hours = input.required<AgendaHours>();
  readonly opened = output<Appointment>();
  readonly slotPicked = output<Date>();
  readonly dayPicked = output<Date>();
  readonly rescheduled = output<Rescheduled>();
}

const never = () => new Promise<never>(() => undefined);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface RenderOptions {
  api?: Record<string, unknown>;
  defaultView?: AgendaView;
  panelResult?: { created: CreatedAppointments };
}

async function render(url: string, options: RenderOptions = {}) {
  const panels = {
    // Le panneau prévient la page par `onCreated` (même s'il est fermé pendant l'envoi).
    open: vi.fn((_component: unknown, opts: { data: NewAppointmentData; width?: number }) => {
      if (options.panelResult) opts.data.onCreated?.(options.panelResult.created);
      return { closed: Promise.resolve(options.panelResult) };
    }),
  };
  const load = vi.fn((range: AgendaRange) => Promise.resolve(weekAgenda(range)));
  const api = {
    load,
    requests: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    cancelSeries: vi.fn(),
    preparation: vi.fn().mockResolvedValue({
      lastSessionAt: '2026-10-24T08:00:00Z',
      feelings: 2,
      events: 1,
      others: 0,
      followedSince: '2025-03-01',
    }),
    patientAppointments: vi.fn().mockResolvedValue({
      appointments: [],
      defaults: { durationMin: 50, modality: 'in_person', rhythm: 'toutes les 2 semaines' },
    }),
    ...options.api,
  };
  const agendaPrefs = signal({
    dayStartHour: 9,
    dayEndHour: 19,
    workingDays: [1, 2, 3, 4, 5, 6],
    defaultView: options.defaultView ?? ('week' as AgendaView),
  });
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([
        { path: 'agenda', children: AGENDA_ROUTES },
        { path: 'patients/:id', component: Blank },
      ]),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: AgendaApi, useValue: api },
      { provide: SidePanelService, useValue: panels },
      {
        provide: PreferencesStore,
        useValue: { agenda: agendaPrefs, defaultDurationMin: () => 60 },
      },
    ],
  });
  TestBed.overrideComponent(AgendaPage, {
    remove: { imports: [AgendaCalendarComponent] },
    add: { imports: [StubCalendar] },
  });
  const router = TestBed.inject(Router);
  const toasts = TestBed.inject(ToastService);
  toasts.clear();
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(Host);
  document.body.append(fixture.nativeElement);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    router,
    panels,
    api,
    load,
    toasts,
    stub: () => el.querySelector<HTMLElement>('.stub')?.dataset ?? {},
    pressed: () =>
      [...el.querySelectorAll<HTMLButtonElement>('.views button')].map((b) =>
        b.getAttribute('aria-pressed'),
      ),
    events: () => [...el.querySelectorAll<HTMLAnchorElement>('pm-agenda-calendar a.event')],
    detail: () => el.querySelector<HTMLElement>('pm-appointment-detail'),
    requestsButton: () => el.querySelector<HTMLButtonElement>('.toolbar button.requests')!,
    requestsPanel: () => el.querySelector<HTMLElement>('pm-online-requests'),
  };
}

/** Nom tiré du contenu, sans ce qui est `aria-hidden` (la pastille du compteur). */
function nameOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return text(clone);
}

function key(name: string): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

describe('AgendaPage', () => {
  afterEach(() => {
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
  });

  it('semaine : barre d’outils sans état de synchronisation, rail, 14 rendez-vous, bornes des préférences', async () => {
    const { el, pressed, stub } = await render('/agenda?view=week&date=2026-10-26');
    expect(text(el.querySelector('h1'))).toBe('Agenda');
    expect(text(el.querySelector('.range'))).toBe('26 octobre – 1er novembre 2026');
    expect(el.querySelector('.range sup')?.textContent).toBe('er');
    expect(text(el.querySelector('.meta'))).toBe('· semaine 44 · 14 séances');
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
    expect(el.querySelector('.sync')).toBeNull();
    expect(text(el.querySelector('pm-mini-month .month'))).toBe('Octobre 2026');
    expect(el.querySelectorAll('pm-agenda-calendars input[type=checkbox]')).toHaveLength(3);
    expect(text(el.querySelector('pm-agenda-calendars .google'))).toBe('Google Agenda à venir');
    expect(
      [...el.querySelectorAll('pm-agenda-calendars .legend li')].map((li) => text(li)),
    ).toEqual(['À confirmer', 'Demande en ligne']);
    expect(stub()).toMatchObject({ view: 'week', anchor: '26', count: '14', startHour: '9' });
    expect(el.querySelector('pm-appointment-detail')).toBeNull();
  });

  it('sans ?view=, la vue par défaut du compte (agenda.defaultView)', async () => {
    const { pressed, stub } = await render('/agenda?date=2026-10-26', { defaultView: 'list' });
    expect(pressed()).toEqual(['false', 'false', 'false', 'true']);
    expect(stub()['view']).toBe('list');
  });

  it('chargement sans donnée : squelette ; erreur : bloc erreur et Réessayer relit', async () => {
    const loading = await render('/agenda?view=week&date=2026-10-26', { api: { load: never } });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(loading.el.querySelector('pm-agenda-calendar')).toBeNull();
    loading.fixture.destroy();
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
    TestBed.resetTestingModule();

    const load = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockImplementation((range: AgendaRange) => Promise.resolve(weekAgenda(range)));
    const failed = await render('/agenda?view=week&date=2026-10-26', { api: { load } });
    expect(failed.el.querySelector('pm-state [role="alert"]')).not.toBeNull();
    failed.el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await settle(failed.fixture);
    expect(load).toHaveBeenCalledTimes(2);
    expect(failed.stub()['count']).toBe('14');
  });

  it('vue liste vide : état vide ; vue mois et jour par l’URL', async () => {
    const empty = await render('/agenda?view=list&date=2026-10-26', {
      api: { load: vi.fn().mockResolvedValue({ appointments: [], busy: [] }) },
    });
    expect(text(empty.el.querySelector('pm-state [role="status"]'))).toContain(
      'Aucun rendez-vous dans les 30 prochains jours',
    );
    empty.el.querySelectorAll<HTMLButtonElement>('.views button')[2].click();
    await settle(empty.fixture);
    expect(empty.router.url).toBe('/agenda?view=month&date=2026-10-26');
    expect(text(empty.el.querySelector('.range'))).toBe('Octobre 2026');
    empty.el.querySelector<HTMLButtonElement>('pm-agenda-calendar .day')!.click();
    await settle(empty.fixture);
    expect(empty.router.url).toBe('/agenda?view=day&date=2026-10-26');
  });

  it('rendez-vous ouvert : détail à droite, contexte du patient ; ↓ ↑ changent ; Échap ferme', async () => {
    const { fixture, router, stub, detail } = await render(
      '/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26',
    );
    expect(stub()['selected']).toBe('rdv-2026-10-31-13');
    const aside = detail()!;
    expect(aside.getAttribute('aria-label')).toBe('Détail du rendez-vous');
    expect(text(aside.querySelector('.kicker'))).toBe('Séance planifiée · cabinet');
    expect(text(aside.querySelector('.name'))).toBe('Marie D.');
    expect(text(aside.querySelector('.meta'))).toBe('34 ans · suivi depuis mars 2025');
    expect(text(aside.querySelector('.when'))).toBe('Samedi 31 octobre · 10:00 – 10:50');
    expect([...aside.querySelectorAll('.facts span')].map((span) => text(span))).toEqual([
      'Cabinet',
      '50 min',
      'Rythme : toutes les 2 semaines',
    ]);
    expect(text(aside.querySelector('.prepare'))).toBe(
      'Dernière séance le 24 oct. · depuis : 2 ressentis, 1 événement',
    );
    expect(aside.querySelector('.google')).toBeNull();
    expect(aside.querySelector('input[role=switch]')).toBeNull();

    key('ArrowDown');
    await settle(fixture);
    expect(router.url).toBe('/agenda/rdv/rdv-2026-10-31-14?view=week&date=2026-10-26');
    expect(text(detail()?.querySelector('.name'))).toBe('Théo B.');
    key('ArrowUp');
    await settle(fixture);
    expect(text(detail()?.querySelector('.name'))).toBe('Marie D.');

    key('Escape');
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-10-26');
    expect(detail()).toBeNull();
  });

  it('lien direct vers un rendez-vous inconnu : 404 → « Rendez-vous introuvable » dans le détail', async () => {
    const { detail } = await render('/agenda/rdv/inconnu?view=week&date=2026-10-26', {
      api: { get: vi.fn().mockRejectedValue({ status: 404, code: 'APPOINTMENT_NOT_FOUND' }) },
    });
    expect(text(detail()?.querySelector('pm-state'))).toContain('Rendez-vous introuvable');
  });

  it('‹ ›, mini-mois et cases du rail pilotent l’URL et les données du calendrier', async () => {
    const { fixture, el, router, stub } = await render('/agenda?view=week&date=2026-10-26');
    el.querySelector<HTMLButtonElement>('.steps button:last-child')!.click();
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-11-02');
    expect(stub()['anchor']).toBe('2');

    const video = [...el.querySelectorAll<HTMLLabelElement>('pm-agenda-calendars label')].find(
      (label) => label.textContent?.includes('Séances en visio'),
    )!;
    video.querySelector('input')!.click();
    await settle(fixture);
    expect(stub()['count']).toBe('11');
    expect(text(el.querySelector('.meta'))).toBe('· semaine 45 · 11 séances');
  });

  it('« + Rendez-vous » et un créneau ouvrent le panneau 15b à 520 px, sans patient', async () => {
    const { fixture, el, panels } = await render('/agenda?view=week&date=2026-10-26');
    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn.primary')!.click();
    await settle(fixture);
    expect(panels.open).toHaveBeenCalledTimes(1);
    const [, options] = panels.open.mock.calls[0];
    expect(options.width).toBe(520);
    expect(options.data.slot.getHours()).toBe(10);
    expect(options.data.slot.getDate()).toBe(26);
    expect(options.data.patient).toBeNull();
    el.querySelector<HTMLButtonElement>('pm-agenda-calendar .slot')!.click();
    await settle(fixture);
    expect(panels.open).toHaveBeenCalledTimes(2);
  });

  it('glisser-déposer : PATCH (début, durée) puis relecture ; chevauchement → toast d’information', async () => {
    const update = vi.fn().mockResolvedValue({
      appointment: appointmentOf({ startsAt: '2026-10-26T12:00:00.000Z' }),
      conflicts: [
        {
          appointmentId: 'x',
          patientDisplayName: 'Léa T.',
          startsAt: new Date(2026, 9, 26, 13, 0).toISOString(),
          endsAt: new Date(2026, 9, 26, 13, 50).toISOString(),
          occurrenceStartsAt: '2026-10-26T12:00:00.000Z',
        },
      ],
    });
    const { fixture, el, load, toasts } = await render('/agenda?view=day&date=2026-10-26', {
      api: { update },
    });
    el.querySelector<HTMLButtonElement>('pm-agenda-calendar .move')!.click();
    await settle(fixture);
    expect(update).toHaveBeenCalledWith('rdv-2026-10-26-1', {
      startsAt: '2026-10-26T12:00:00.000Z',
      durationMin: 80,
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(toasts.toasts().map((t) => [t.level, t.message])).toEqual([
      ['info', 'Chevauche le rendez-vous de Léa T. à 13:00.'],
    ]);
  });

  it('glisser-déposer refusé (409) : relecture et toast avec le détail du problème', async () => {
    const update = vi.fn().mockRejectedValue({
      status: 409,
      code: 'APPOINTMENT_NOT_ACTIVE',
      detail: 'Ce rendez-vous est annulé.',
    });
    const { fixture, el, load, toasts } = await render('/agenda?view=day&date=2026-10-26', {
      api: { update },
    });
    el.querySelector<HTMLButtonElement>('pm-agenda-calendar .move')!.click();
    await settle(fixture);
    expect(load).toHaveBeenCalledTimes(2);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Ce rendez-vous est annulé.']);
  });

  it('après une création : relecture, première occurrence ouverte, toast « Annuler » qui annule la série', async () => {
    const created: CreatedAppointments = {
      appointments: [
        appointmentOf({
          id: 'n-1',
          seriesId: 's-1',
          startsAt: new Date(2026, 9, 27, 9).toISOString(),
        }),
        appointmentOf({
          id: 'n-2',
          seriesId: 's-1',
          startsAt: new Date(2026, 10, 10, 9).toISOString(),
        }),
        appointmentOf({
          id: 'n-3',
          seriesId: 's-1',
          startsAt: new Date(2026, 10, 24, 9).toISOString(),
        }),
      ],
      conflicts: [],
    };
    const cancelSeries = vi.fn().mockResolvedValue([]);
    const { fixture, el, router, load, toasts } = await render(
      '/agenda?view=week&date=2026-10-26',
      {
        api: { cancelSeries, get: vi.fn().mockResolvedValue(created.appointments[0]) },
        panelResult: { created },
      },
    );
    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn.primary')!.click();
    await settle(fixture);
    expect(load).toHaveBeenCalledTimes(2);
    expect(router.url).toBe('/agenda/rdv/n-1?view=week&date=2026-10-26');
    const [toast] = toasts.toasts();
    expect(toast.message).toBe('3 rendez-vous planifiés');
    expect(toast.durationMs).toBe(10_000);
    expect(toast.action?.label).toBe('Annuler');
    toast.action!.handler();
    await settle(fixture);
    expect(cancelSeries).toHaveBeenCalledWith('s-1');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('détail fermé alors que son rendez-vous a disparu (annulé) : focus au voisin du jour, sinon à la vue', async () => {
    const { fixture, el, detail, load } = await render(
      '/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26',
    );
    // Relecture sans Marie D. (annulée) : Théo B. reste le même jour.
    load.mockImplementation((range: AgendaRange) => {
      const data = weekAgenda(range);
      return Promise.resolve({
        ...data,
        appointments: data.appointments.filter((a) => a.id !== 'rdv-2026-10-31-13'),
      });
    });
    detail()!.querySelector<HTMLButtonElement>('.close')!.click();
    await settle(fixture);
    // La doublure n'a pas de liens .fc-event : la zone de la vue reçoit le focus.
    expect(document.activeElement).toBe(el.querySelector('section.view'));
  });

  it('double-clic → dossier patient', async () => {
    const { fixture, router, events } = await render('/agenda?view=day&date=2026-10-26');
    events()[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);
    expect(router.url).toBe('/patients/p-leat');
  });

  it('rendez-vous invité : détail sans lien ni Dupliquer, double-clic sans dossier, « + Rendez-vous » sans patient', async () => {
    const guest = guestAppointmentOf({
      id: 'invite',
      startsAt: new Date(2026, 9, 26, 14, 0).toISOString(),
    });
    const load = vi.fn((range: AgendaRange) => {
      const week = weekAgenda(range);
      return Promise.resolve({ ...week, appointments: [...week.appointments, guest] });
    });
    const { fixture, el, router, panels, api, events, detail } = await render(
      '/agenda/rdv/invite?view=day&date=2026-10-26',
      { api: { load } },
    );
    expect(text(detail()!.querySelector('.name'))).toBe('Sara Benali');
    expect(detail()!.querySelector('a[href*="/patients"]')).toBeNull();
    expect(api.preparation).not.toHaveBeenCalled();

    const sara = events().find((item) => text(item) === 'Benali')!;
    sara.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);
    expect(router.url).toBe('/agenda/rdv/invite?view=day&date=2026-10-26');

    const actions = [...detail()!.querySelectorAll<HTMLButtonElement>('.actions button')];
    expect(actions.map((button) => text(button))).not.toContain('Dupliquer');

    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn.primary')!.click();
    await settle(fixture);
    expect(panels.open.mock.calls[0][1].data.patient).toBeNull();
  });

  describe('demandes en ligne', () => {
    const sara = onlineRequestOf({
      id: 'req-1',
      startsAt: new Date(2026, 9, 29, 10, 0).toISOString(),
      durationMin: 60,
    });
    const hugo = onlineRequestOf({
      id: 'req-2',
      startsAt: new Date(2026, 11, 1, 14, 0).toISOString(),
      durationMin: 60,
      modality: 'video',
    });

    it('entrée « Demandes » entre les vues et « + Rendez-vous » : compteur de l’API dans la pastille et le nom', async () => {
      const requests = vi.fn().mockResolvedValue([sara, hugo]);
      const { el, requestsButton, requestsPanel } = await render(
        '/agenda?view=week&date=2026-10-26',
        { api: { requests } },
      );
      expect(requests).toHaveBeenCalledTimes(1);
      const toolbar = [...el.querySelector('.toolbar')!.children].map((child) =>
        child.classList.contains('views') ? 'vues' : nameOf(child),
      );
      expect(toolbar.slice(-3)).toEqual([
        'vues',
        'Demandes en ligne, 2 en attente',
        '+ Rendez-vous',
      ]);
      const button = requestsButton();
      // À l'écran : « Demandes » et la pastille ; le reste du nom est masqué (sr-only).
      expect(button.querySelector('.sr-only')?.textContent).toBe(' en ligne, 2 en attente');
      expect(button.querySelector('.count')!.getAttribute('aria-hidden')).toBe('true');
      expect(text(button.querySelector('.count'))).toBe('2');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(requestsPanel()).toBeNull();
    });

    it('aucune demande : l’entrée reste, sans pastille ; le panneau montre l’état vide', async () => {
      const { fixture, requestsButton, requestsPanel } = await render(
        '/agenda?view=week&date=2026-10-26',
      );
      const button = requestsButton();
      expect(text(button)).toBe('Demandes en ligne, aucune en attente');
      expect(button.querySelector('.sr-only')?.textContent).toBe(' en ligne, aucune en attente');
      expect(button.querySelector('.count')).toBeNull();
      expect(nameOf(button)).toBe('Demandes en ligne, aucune en attente');
      button.click();
      await settle(fixture);
      expect(text(requestsPanel()?.querySelector('pm-state'))).toContain(
        'Aucune demande en attente',
      );
    });

    it('ouvrir à la place du détail, choisir une demande hors de la semaine : grille à sa date, détail ouvert et focalisé', async () => {
      const requests = vi.fn().mockResolvedValue([sara, hugo]);
      const get = vi.fn().mockResolvedValue(hugo);
      const { fixture, router, stub, detail, requestsButton, requestsPanel } = await render(
        '/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26',
        { api: { requests, get } },
      );
      expect(detail()).not.toBeNull();
      requestsButton().click();
      await settle(fixture);
      // Le panneau prend la place du détail (le détail se ferme, l'URL perd /rdv/:id).
      expect(router.url).toBe('/agenda?view=week&date=2026-10-26');
      expect(detail()).toBeNull();
      const panel = requestsPanel()!;
      expect(panel.id).toBe(requestsButton().getAttribute('aria-controls'));
      expect(requestsButton().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(panel.querySelector('h2'));
      const rows = [...panel.querySelectorAll<HTMLButtonElement>('ul.req-list button')];
      expect(rows.map((row) => text(row.querySelector('.who')))).toEqual([
        'Sara Benali · Cabinet',
        'Sara Benali · Visio',
      ]);

      rows[1].click();
      await settle(fixture);
      expect(router.url).toBe('/agenda/rdv/req-2?view=week&date=2026-12-01');
      expect(stub()['anchor']).toBe('1');
      expect(requestsPanel()).toBeNull();
      expect(get).toHaveBeenCalledWith('req-2');
      expect(text(detail()?.querySelector('.online'))).toBe('Demande en ligne');
      expect(document.activeElement).toBe(detail());
      // La nouvelle plage a relu les demandes.
      expect(requests).toHaveBeenCalledTimes(2);
    });

    it('Échap ferme le panneau et rend le focus à l’entrée ; « Demandes » le referme aussi', async () => {
      const { fixture, requestsButton, requestsPanel } = await render(
        '/agenda?view=week&date=2026-10-26',
        { api: { requests: vi.fn().mockResolvedValue([sara]) } },
      );
      requestsButton().click();
      await settle(fixture);
      expect(requestsPanel()).not.toBeNull();
      key('Escape');
      await settle(fixture);
      expect(requestsPanel()).toBeNull();
      expect(document.activeElement).toBe(requestsButton());
      requestsButton().click();
      await settle(fixture);
      requestsButton().click();
      await settle(fixture);
      expect(requestsPanel()).toBeNull();
      expect(requestsButton().getAttribute('aria-expanded')).toBe('false');
    });

    it('erreur de lecture des demandes : la grille reste ; le panneau dit l’erreur et Réessayer relit la liste', async () => {
      const requests = vi
        .fn()
        .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
        .mockResolvedValue([sara]);
      const { fixture, stub, load, requestsButton, requestsPanel } = await render(
        '/agenda?view=week&date=2026-10-26',
        { api: { requests } },
      );
      expect(stub()['count']).toBe('14');
      expect(nameOf(requestsButton())).toBe('Demandes en ligne');
      requestsButton().click();
      await settle(fixture);
      const panel = requestsPanel()!;
      expect(text(panel.querySelector('pm-state [role="alert"]'))).toContain(
        "Les demandes n'ont pas pu être chargées.",
      );
      panel.querySelector<HTMLButtonElement>('pm-state button')!.click();
      await settle(fixture);
      expect(requests).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenCalledTimes(1);
      expect(nameOf(requestsButton())).toBe('Demandes en ligne, 1 en attente');
      expect(requestsPanel()?.querySelectorAll('ul.req-list button')).toHaveLength(1);
    });

    it('confirmer une demande dans le détail : relecture de la plage et des demandes, compteur relu', async () => {
      const requests = vi.fn().mockResolvedValueOnce([sara, hugo]).mockResolvedValue([hugo]);
      const load = vi.fn((range: AgendaRange) => {
        const week = weekAgenda(range);
        return Promise.resolve({ ...week, appointments: [...week.appointments, sara] });
      });
      const confirm = vi.fn().mockResolvedValue({ ...sara, status: 'planned' });
      const { fixture, detail, toasts, requestsButton } = await render(
        '/agenda/rdv/req-1?view=week&date=2026-10-26',
        { api: { requests, load, confirm } },
      );
      expect(nameOf(requestsButton())).toBe('Demandes en ligne, 2 en attente');
      [...detail()!.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => text(b) === 'Confirmer le rendez-vous')!
        .click();
      await settle(fixture);
      expect(confirm).toHaveBeenCalledWith('req-1');
      expect(load).toHaveBeenCalledTimes(2);
      expect(requests).toHaveBeenCalledTimes(2);
      expect(nameOf(requestsButton())).toBe('Demandes en ligne, 1 en attente');
      expect(text(requestsButton().querySelector('.count'))).toBe('1');
      expect(toasts.toasts().map((t) => t.message)).toEqual([
        'Rendez-vous confirmé. Le demandeur est prévenu par e-mail.',
      ]);
    });
  });
});

describe('AgendaPage, textes au pluriel et messages entiers (M16-23)', () => {
  afterEach(() => {
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
  });

  const reset = () => {
    TestBed.resetTestingModule();
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
  };

  it('compte des séances au pluriel ICU : texte rendu identique, caractère pour caractère', async () => {
    const week = await render('/agenda?view=week&date=2026-10-26');
    expect(week.el.querySelector('.meta')!.textContent).toBe('· semaine 44 · 14 séances');
    reset();

    const one = await render('/agenda?view=week&date=2026-10-26', {
      api: {
        load: vi.fn((range: AgendaRange) => {
          const data = weekAgenda(range);
          return Promise.resolve({ ...data, appointments: data.appointments.slice(0, 1) });
        }),
      },
    });
    expect(one.el.querySelector('.meta')!.textContent).toBe('· semaine 44 · 1 séance');
    reset();

    const none = await render('/agenda?view=month&date=2026-10-26', {
      api: {
        load: vi.fn((range: AgendaRange) =>
          Promise.resolve({ ...weekAgenda(range), appointments: [] }),
        ),
      },
    });
    expect(none.el.querySelector('.meta')!.textContent).toBe('· aucune séance');
  });

  it('toast de création : un message entier par cas de chevauchement', async () => {
    const at = (day: number) => new Date(2026, 9, day, 9).toISOString();
    const conflict = (appointmentId: string) => ({
      appointmentId,
      patientDisplayName: 'Théo B.',
      startsAt: at(27),
      endsAt: at(27),
      occurrenceStartsAt: at(27),
    });
    const series = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        appointmentOf({
          id: `n-${index + 1}`,
          seriesId: count > 1 ? 's' : null,
          startsAt: at(27 + index),
        }),
      );
    // Les conflits désignent des rendez-vous existants chevauchés (ConflictDto.appointmentId),
    // jamais ceux qu'on crée ; deux conflits sur le même existant comptent pour un.
    const cases: [CreatedAppointments, string][] = [
      [{ appointments: series(1), conflicts: [] }, 'Rendez-vous planifié'],
      [
        { appointments: series(1), conflicts: [conflict('x-1'), conflict('x-1')] },
        'Rendez-vous planifié, 1 chevauchement',
      ],
      [
        { appointments: series(1), conflicts: [conflict('x-1'), conflict('x-2')] },
        'Rendez-vous planifié, 2 chevauchements',
      ],
      [{ appointments: series(2), conflicts: [] }, '2 rendez-vous planifiés'],
      [
        { appointments: series(2), conflicts: [conflict('x-1'), conflict('x-1')] },
        '2 rendez-vous planifiés, 1 chevauchement',
      ],
      [
        {
          appointments: series(3),
          conflicts: [conflict('x-1'), conflict('x-2'), conflict('x-2')],
        },
        '3 rendez-vous planifiés, 2 chevauchements',
      ],
    ];
    for (const [created, message] of cases) {
      const { fixture, el, toasts } = await render('/agenda?view=week&date=2026-10-26', {
        api: { get: vi.fn().mockResolvedValue(created.appointments[0]) },
        panelResult: { created },
      });
      el.querySelector<HTMLButtonElement>('.toolbar .tb-btn.primary')!.click();
      await settle(fixture);
      expect(toasts.toasts()[0].message).toBe(message);
      reset();
    }
  });
});
