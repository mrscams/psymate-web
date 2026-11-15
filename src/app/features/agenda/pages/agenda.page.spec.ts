import { Component, LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { SidePanelService } from '../../../shared/ui';
import { AGENDA_ROUTES } from '../agenda.routes';
import { AgendaApi } from '../data/agenda.api';
import { demoAgenda } from '../data/agenda.fixtures';
import { AgendaRange } from '../data/agenda.model';
import { AgendaPage } from './agenda.page';

@Component({ selector: 'pm-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

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
    page: () => fixture.debugElement.query((node) => node.componentInstance instanceof AgendaPage),
    pressed: () =>
      [...el.querySelectorAll<HTMLButtonElement>('.views button')].map((b) =>
        b.getAttribute('aria-pressed'),
      ),
    events: () => [...el.querySelectorAll<HTMLAnchorElement>('pm-week-grid a.event')],
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

  it('semaine de la maquette : barre d’outils, rail, 7 colonnes, 14 séances, 3 blocs Google', async () => {
    const { el, pressed, events } = await render('/agenda?view=week&date=2026-10-26');
    expect(text(el.querySelector('h1'))).toBe('Agenda');
    expect(text(el.querySelector('.range'))).toBe('26 octobre – 1er novembre 2026');
    expect(el.querySelector('.range sup')?.textContent).toBe('er');
    expect(text(el.querySelector('.meta'))).toBe('· semaine 44 · 14 séances');
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
    expect(text(el.querySelector('.sync'))).toContain('Google Agenda synchronisé');
    expect(el.querySelector('aside.rail pm-mini-month')).not.toBeNull();
    expect(text(el.querySelector('pm-mini-month .month'))).toBe('Octobre 2026');
    expect(el.querySelectorAll('pm-agenda-calendars input[type=checkbox]')).toHaveLength(5);
    expect(el.querySelectorAll('pm-week-grid .day-head')).toHaveLength(7);
    expect(events()).toHaveLength(14);
    expect(el.querySelectorAll('pm-week-grid .busy[role=img]')).toHaveLength(3);
    expect(el.querySelector('pm-week-grid .busy')?.getAttribute('aria-label')).toBe(
      'Indisponible de 14:00 à 16:00, agenda Google Pro',
    );
    const marie = events().find((a) => a.textContent?.includes('Marie D.'))!;
    expect(marie.getAttribute('href')).toBe(
      '/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26',
    );
    expect(text(marie)).toContain('Marie D.');
    expect(text(marie.querySelector('.sr-only'))).toBe('· cabinet');
    expect(text(marie)).toContain('10:00–10:50');
    const yanis = events().find((a) => a.textContent?.includes('Yanis M.'))!;
    expect(yanis.classList.contains('tentative')).toBe(true);
    expect(text(yanis)).toContain('à confirmer');
    const ines = events().find((a) => a.textContent?.includes('Inès V.'))!;
    expect(ines.classList.contains('contact')).toBe(true);
    expect(text(ines.querySelector('.sr-only'))).toBe('· téléphone');
    expect(text(ines).replace(' · téléphone', '')).toBe('Appel · Inès V. 15:00');
    expect(el.querySelector('pm-appointment-detail')).toBeNull();
  });

  it('chargement sans donnée : squelette ; erreur : bloc erreur et Réessayer relit', async () => {
    const loading = await render('/agenda?view=week&date=2026-10-26', { load: never });
    expect(loading.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(loading.el.querySelector('pm-week-grid')).toBeNull();
    loading.fixture.destroy();
    document.querySelectorAll('pm-host').forEach((node) => node.remove());
    TestBed.resetTestingModule();

    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockImplementation((range: AgendaRange) => Promise.resolve(demoAgenda(range)));
    const failed = await render('/agenda?view=week&date=2026-10-26', { load });
    const alert = failed.el.querySelector('pm-state [role="alert"]');
    expect(alert).not.toBeNull();
    failed.el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await settle(failed.fixture);
    expect(load).toHaveBeenCalledTimes(2);
    expect(failed.el.querySelectorAll('pm-week-grid a.event')).toHaveLength(14);
  });

  it('vue liste vide : état vide ; vue liste pleine : jours groupés ; vue mois : six semaines', async () => {
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
    expect(list.el.querySelectorAll('pm-agenda-list section.day')).toHaveLength(26);
    expect(text(list.el.querySelector('pm-agenda-list h3'))).toBe('Lundi 26 octobre');
    list.el.querySelectorAll<HTMLButtonElement>('.views button')[2].click();
    await settle(list.fixture);
    expect(list.router.url).toBe('/agenda?view=month&date=2026-10-26');
    expect(list.el.querySelectorAll('pm-month-grid .cell')).toHaveLength(35);
    expect(text(list.el.querySelector('.range'))).toBe('Octobre 2026');
  });

  it('clic sur un rendez-vous : /agenda/rdv/:id et détail à droite ; ↓ passe au suivant ; Échap ferme', async () => {
    const { fixture, el, router, events, detail } = await render(
      '/agenda?view=week&date=2026-10-26',
    );
    events()
      .find((a) => a.textContent?.includes('Marie D.'))!
      .click();
    await settle(fixture);
    expect(router.url).toBe('/agenda/rdv/rdv-2026-10-31-13?view=week&date=2026-10-26');
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
    expect(el.querySelector('pm-week-grid a.event.selected')?.getAttribute('aria-current')).toBe(
      'true',
    );
    expect(el.querySelector('a.event.selected')?.textContent).toContain('Marie D.');

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
  });

  it('Aujourd’hui, ‹ ›, mini-mois et cases du rail pilotent l’URL et la grille', async () => {
    const { fixture, el, router, events } = await render('/agenda?view=week&date=2026-10-26');
    el.querySelector<HTMLButtonElement>('.steps button:last-child')!.click();
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-11-02');
    expect(text(el.querySelector('.range'))).toBe('2 – 8 novembre 2026');
    el.querySelector<HTMLButtonElement>('pm-mini-month .day.in-range')!.click();
    await settle(fixture);
    expect(router.url).toBe('/agenda?view=week&date=2026-11-02');

    const video = [...el.querySelectorAll<HTMLLabelElement>('pm-agenda-calendars label')].find(
      (label) => label.textContent?.includes('Séances en visio'),
    )!;
    video.querySelector('input')!.click();
    await settle(fixture);
    expect(events()).toHaveLength(11);
    expect(text(el.querySelector('.meta'))).toBe('· semaine 45 · 11 séances');

    el.querySelector<HTMLButtonElement>('.toolbar .tb-btn')!.click();
    await settle(fixture);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(router.url).toBe(`/agenda?view=week&date=${iso}`);
  });

  it('« + Rendez-vous » ouvre le panneau 15b à 520 px sur le créneau de 10 h de la date ancrée', async () => {
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
  });

  it('vue jour : une seule colonne, les deux séances du samedi ; double-clic → dossier patient', async () => {
    const { fixture, el, router, events } = await render('/agenda?view=day&date=2026-10-31');
    expect(el.querySelectorAll('pm-week-grid .day-head')).toHaveLength(1);
    expect(events()).toHaveLength(2);
    expect(text(el.querySelector('.range'))).toBe('Samedi 31 octobre 2026');
    expect(text(el.querySelector('.meta'))).toBe('· 2 séances');
    events()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);
    expect(router.url).toBe('/patients/demo-maried');
  });
});
