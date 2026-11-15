import { Component, input, LOCALE_ID, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { SidePanelService } from '../../../shared/ui';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaApi } from '../data/agenda.api';
import { demoAgenda } from '../data/agenda.fixtures';
import { AgendaRange, AgendaView, Appointment, BusyBlock } from '../data/agenda.model';
import { AgendaCalendarComponent, Rescheduled } from '../ui/agenda-calendar.component';
import { AgendaPage } from './agenda.page';

@Component({ selector: 'pm-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

/**
 * Doublure de pm-agenda-calendar : FullCalendar mesure le DOM, ce que jsdom ne fait pas. Elle expose
 * ce que la page lui donne (vue, date, rendez-vous, blocs, sélection) et ses sorties par des boutons.
 */
@Component({
  selector: 'pm-agenda-calendar',
  template: `
    <div
      class="stub"
      [attr.data-view]="view()"
      [attr.data-anchor]="anchor().getDate()"
      [attr.data-count]="appointments().length"
      [attr.data-busy]="busy().length"
      [attr.data-selected]="selectedId()"
    ></div>
    @for (item of appointments(); track item.id) {
      <a class="event" [class.selected]="item.id === selectedId()" (dblclick)="opened.emit(item)">
        {{ item.patient.displayName }}
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
          endsAt: '2026-10-26T13:00:00.000Z',
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
  readonly opened = output<Appointment>();
  readonly slotPicked = output<Date>();
  readonly dayPicked = output<Date>();
  readonly rescheduled = output<Rescheduled>();
}

const never = () => new Promise<never>(() => undefined);

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function render(url: string, api: Partial<AgendaApi> = {}) {
  const panels = { open: vi.fn().mockReturnValue(null) };
  const load = vi.fn((range: AgendaRange) => Promise.resolve(demoAgenda(range)));
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([
        { path: 'agenda', children: AGENDA_ROUTES },
        { path: 'patients/:id', component: Blank },
      ]),
      { provide: LOCALE_ID, useValue: 'fr' },
      {
        provide: AgendaApi,
        useValue: {
          load,
          syncStatus: vi.fn().mockResolvedValue({ state: 'ok', minutesAgo: 2 }),
          ...api,
        },
      },
      { provide: SidePanelService, useValue: panels },
    ],
  });
  TestBed.overrideComponent(AgendaPage, {
    remove: { imports: [AgendaCalendarComponent] },
    add: { imports: [StubCalendar] },
  });
  const router = TestBed.inject(Router);
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
    load,
    stub: () => el.querySelector<HTMLElement>('.stub')?.dataset ?? {},
    pressed: () =>
      [...el.querySelectorAll<HTMLButtonElement>('.views button')].map((b) =>
        b.getAttribute('aria-pressed'),
      ),
    events: () => [...el.querySelectorAll<HTMLAnchorElement>('pm-agenda-calendar a.event')],
    detail: () => el.querySelector<HTMLElement>('pm-appointment-detail'),
  };
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

  it('semaine de la maquette : barre d’outils, rail, 14 séances et 3 blocs donnés au calendrier', async () => {
    const { el, pressed, stub } = await render('/agenda?view=week&date=2026-10-26');
    expect(text(el.querySelector('h1'))).toBe('Agenda');
    expect(text(el.querySelector('.range'))).toBe('26 octobre – 1er novembre 2026');
    expect(el.querySelector('.range sup')?.textContent).toBe('er');
    expect(text(el.querySelector('.meta'))).toBe('· semaine 44 · 14 séances');
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
    expect(text(el.querySelector('.sync'))).toContain('Google Agenda synchronisé');
    expect(el.querySelector('aside.rail pm-mini-month')).not.toBeNull();
    expect(text(el.querySelector('pm-mini-month .month'))).toBe('Octobre 2026');
    expect(el.querySelectorAll('pm-agenda-calendars input[type=checkbox]')).toHaveLength(5);
    expect(stub()).toMatchObject({ view: 'week', anchor: '26', count: '14', busy: '3' });
    expect(el.querySelector('pm-appointment-detail')).toBeNull();
  });

  it('chargement sans donnée : squelette ; erreur : bloc erreur et Réessayer relit', async () => {
    const loading = await render('/agenda?view=week&date=2026-10-26', { load: never });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(loading.el.querySelector('pm-agenda-calendar')).toBeNull();
    loading.fixture.destroy();
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
    TestBed.resetTestingModule();

    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockImplementation((range: AgendaRange) => Promise.resolve(demoAgenda(range)));
    const failed = await render('/agenda?view=week&date=2026-10-26', { load });
    expect(failed.el.querySelector('pm-state [role="alert"]')).not.toBeNull();
    failed.el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await settle(failed.fixture);
    expect(load).toHaveBeenCalledTimes(2);
    expect(failed.stub()['count']).toBe('14');
  });

  it('vue liste vide : état vide ; vue liste pleine et vue mois passées au calendrier', async () => {
    const empty = await render('/agenda?view=list&date=2026-10-26', {
      load: vi.fn().mockResolvedValue({ appointments: [], busy: [] }),
    });
    expect(text(empty.el.querySelector('pm-state [role="status"]'))).toContain(
      'Aucun rendez-vous dans les 30 prochains jours',
    );
    expect(empty.pressed()).toEqual(['false', 'false', 'false', 'true']);
    empty.fixture.destroy();
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
    TestBed.resetTestingModule();

    const list = await render('/agenda?view=list&date=2026-10-26');
    expect(text(list.el.querySelector('.meta'))).toBe('· 30 prochains jours · 62 séances');
    expect(list.stub()).toMatchObject({ view: 'list', count: '62' });
    list.el.querySelectorAll<HTMLButtonElement>('.views button')[2].click();
    await settle(list.fixture);
    expect(list.router.url).toBe('/agenda?view=month&date=2026-10-26');
    expect(list.stub()['view']).toBe('month');
    expect(text(list.el.querySelector('.range'))).toBe('Octobre 2026');
    // Un jour cliqué dans le mois ouvre la vue Jour.
    list.el.querySelector<HTMLButtonElement>('pm-agenda-calendar .day')!.click();
    await settle(list.fixture);
    expect(list.router.url).toBe('/agenda?view=day&date=2026-10-26');
  });

  it('rendez-vous ouvert : /agenda/rdv/:id et détail à droite ; ↓ ↑ changent ; Échap ferme', async () => {
    const { fixture, router, stub, detail } = await render(
      '/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26',
    );
    expect(stub()['selected']).toBe('rdv-2026-10-31-13');
    const aside = detail()!;
    expect(aside.getAttribute('aria-label')).toBe('Détail du rendez-vous');
    expect(text(aside.querySelector('.kicker'))).toBe('Séance planifiée · cabinet');
    expect(text(aside.querySelector('.name'))).toBe('Marie D.');
    expect(text(aside.querySelector('.meta'))).toBe(
      '34 ans · suivi depuis mars 2025 · à surveiller',
    );
    expect(text(aside.querySelector('.when'))).toBe('Samedi 31 octobre · 10:00 – 10:50');
    expect([...aside.querySelectorAll('.facts span')].map((span) => text(span))).toEqual([
      'Cabinet · 12 rue Vendôme',
      'Séance n° 32',
      'Rythme : toutes les 1 à 2 semaines',
    ]);
    expect(aside.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
      "Reprendre l'entretien du 18 et le carnet du soir.",
    );
    expect(text(aside.querySelector('.google'))).toContain('Séance · M. D.');
    expect(aside.querySelector<HTMLInputElement>('input[role=switch]')?.disabled).toBe(true);
    expect(text(aside.querySelector('.start'))).toBe('Démarrer la séance');

    key('ArrowDown');
    await settle(fixture);
    expect(router.url).toBe('/agenda/rdv/rdv-2026-10-31-14?view=week&date=2026-10-26');
    expect(text(detail()?.querySelector('.name'))).toBe('Théo B.');
    key('ArrowDown');
    await settle(fixture);
    expect(text(detail()?.querySelector('.name'))).toBe('Théo B.');
    key('ArrowUp');
    await settle(fixture);
    expect(text(detail()?.querySelector('.name'))).toBe('Marie D.');

    key('Escape');
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-10-26');
    expect(detail()).toBeNull();
    expect(stub()['selected']).toBeUndefined();
  });

  it('Aujourd’hui, ‹ ›, mini-mois et cases du rail pilotent l’URL et les données du calendrier', async () => {
    const { fixture, el, router, stub } = await render('/agenda?view=week&date=2026-10-26');
    el.querySelector<HTMLButtonElement>('.steps button:last-child')!.click();
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-11-02');
    expect(text(el.querySelector('.range'))).toBe('2 – 8 novembre 2026');
    expect(stub()['anchor']).toBe('2');
    el.querySelector<HTMLButtonElement>('pm-mini-month .day.in-range')!.click();
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-11-02');

    const video = [...el.querySelectorAll<HTMLLabelElement>('pm-agenda-calendars label')].find(
      (label) => label.textContent?.includes('Séances en visio'),
    )!;
    video.querySelector('input')!.click();
    await settle(fixture);
    expect(stub()['count']).toBe('11');
    expect(text(el.querySelector('.meta'))).toBe('· semaine 45 · 11 séances');

    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn')!.click();
    await settle(fixture);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(router.url).toBe(`/agenda?view=week&date=${iso}`);
  });

  it('« + Rendez-vous » et un créneau cliqué ouvrent le panneau 15b à 520 px', async () => {
    const { fixture, el, panels } = await render('/agenda?view=week&date=2026-10-26');
    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn.primary')!.click();
    await settle(fixture);
    expect(panels.open).toHaveBeenCalledTimes(1);
    const [, options] = panels.open.mock.calls[0];
    expect(options.width).toBe(520);
    expect(options.data.slot.getHours()).toBe(10);
    expect(options.data.slot.getDate()).toBe(26);
    expect(options.data.patient).toBeNull();
    expect(options.data.appointments).toHaveLength(14);

    el.querySelector<HTMLButtonElement>('pm-agenda-calendar .slot')!.click();
    await settle(fixture);
    expect(panels.open).toHaveBeenCalledTimes(2);
  });

  it('double-clic → dossier patient ; déplacement dans la grille → nouvelles bornes dans le store', async () => {
    const { fixture, el, router, events } = await render('/agenda?view=day&date=2026-10-26');
    expect(text(el.querySelector('.range'))).toBe('Lundi 26 octobre 2026');
    expect(text(el.querySelector('.meta'))).toBe('· 3 séances');
    el.querySelector<HTMLButtonElement>('pm-agenda-calendar .move')!.click();
    await settle(fixture);
    // Omar B. (09:00) déplacé à 12:00 UTC : le store garde l'ordre chronologique.
    expect(events().map((a) => text(a))).toEqual(['Léa T.', 'Omar B.', 'Julie M.']);
    events()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);
    expect(router.url).toBe('/patients/demo-leat');
  });
});
