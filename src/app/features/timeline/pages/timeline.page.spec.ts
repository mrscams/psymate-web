import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { PatientShellStore } from '../../patient-shell';
import { NO_FILTERS } from '../data/timeline-filters.model';
import { TimelineApi } from '../data/timeline.api';
import { items, pagedTimeline, timelineItem, timelinePage } from '../data/timeline.fixtures';
import { TimelinePage as Page, TimelineQuery, TimelineSnapshot } from '../data/timeline.model';
import { TimelinePage } from './timeline.page';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function shellMock(snapshot?: TimelineSnapshot) {
  return {
    patient: signal({ id: 'p-1', displayName: 'Lina T.', followedSince: '2025-03-04' }),
    recallTab: vi.fn().mockReturnValue(snapshot),
    rememberTab: vi.fn(),
  };
}

function prefsMock(groupBy: 'session' | 'month' | 'chronological' = 'chronological') {
  const timelineGroupBy = signal(groupBy);
  return {
    defaultVisibility: signal('clinical'),
    medicationVisible: signal(true),
    timelineGroupBy,
    set: vi.fn(async (_key: string, value: 'session' | 'month' | 'chronological') => {
      timelineGroupBy.set(value);
      return null;
    }),
  };
}

async function render(
  page: (id: string, query: TimelineQuery) => Promise<Page>,
  shell = shellMock(),
  focus: string | null = null,
  options: { prefs?: ReturnType<typeof prefsMock>; params?: Record<string, string> } = {},
) {
  const prefs = options.prefs ?? prefsMock();
  const params = { ...(options.params ?? {}), ...(focus ? { focus } : {}) };
  const paramMap = convertToParamMap(params);
  const sessionDetail = vi.fn(() => never());
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...(Object.keys(params).length
        ? [
            {
              provide: ActivatedRoute,
              useValue: { queryParamMap: of(paramMap), snapshot: { queryParamMap: paramMap } },
            },
          ]
        : []),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: PatientShellStore, useValue: shell },
      {
        provide: TimelineApi,
        useValue: {
          page: vi.fn(page),
          sessions: vi.fn().mockResolvedValue({}),
          emotions: vi.fn().mockResolvedValue({ labels: { anxiety: 'Anxiété' }, families: {} }),
          sessionDetail,
        },
      },
      { provide: PreferencesStore, useValue: prefs },
      // L'éditeur d'entrée (features/entries) lit l'API par HttpClient : requêtes en attente ici.
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(TimelinePage);
  await flush();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, shell, prefs };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelinePage', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true);
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('chargement : squelette de cartes, pas de liste', async () => {
    const { el } = await render(() => never());
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('[role="list"]')).toBeNull();
  });

  it('erreur : bloc erreur, Réessayer relit la première fenêtre', async () => {
    const page = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(timelinePage({ items: items(2) }));
    const { el, fixture } = await render(page);
    const alert = el.querySelector('pm-state [role="alert"]');
    expect(text(alert)).toContain('Impossible de charger la timeline');
    alert!.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    await fixture.whenStable();
    expect(el.querySelectorAll('pm-timeline-card')).toHaveLength(2);
  });

  it('vide : message vers la barre de capture', async () => {
    const { el } = await render(() =>
      Promise.resolve(timelinePage({ facets: { types: {}, emotions: {}, tags: {} } })),
    );
    expect(text(el.querySelector('pm-state [role="status"]'))).toContain('Aucune entrée');
  });

  it('chargée : ligne d’état, liste étiquetée, cartes, axe et bandes', async () => {
    const reorg = timelineItem({
      id: 'reorg',
      type: 'situation',
      title: 'Réorganisation du service',
      occurred: { from: '2026-04-22T00:00:00Z', to: null, precision: 'day', label: null },
      ongoing: true,
    });
    const list = [timelineItem({ id: 'a', title: 'Entretien annuel' }), reorg];
    const { el } = await render(() =>
      Promise.resolve(
        timelinePage({
          items: list,
          ongoingSituations: [reorg],
          facets: { types: { note: 1, situation: 1 }, emotions: {}, tags: {} },
        }),
      ),
    );
    expect(text(el.querySelector('.status-line .count'))).toBe('2 entrées · 1 fenêtre en mémoire');
    expect(el.querySelector('[role="list"]')?.getAttribute('aria-label')).toContain('plus récente');
    expect(el.querySelectorAll('[role="listitem"] pm-timeline-card')).toHaveLength(2);
    const band = el.querySelector('.bands-legend li');
    expect(band?.getAttribute('aria-label')).toContain('Réorganisation du service');
    expect(band?.getAttribute('aria-label')).toContain('en cours');
    expect(el.querySelectorAll('.lane.on')).toHaveLength(2);
    expect(el.querySelector('.arrow')).not.toBeNull();
    expect(el.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('zoom (+, −) : granularité affichée, aucune requête', async () => {
    const { pages } = pagedTimeline(500);
    const page = vi.fn((_id: string, query: TimelineQuery) =>
      Promise.resolve(pages.get(query.cursor)!),
    );
    const { el, fixture } = await render(page);
    const calls = page.mock.calls.length;
    expect(text(el.querySelector('.granularity'))).toBe('Semaine');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(text(el.querySelector('.granularity'))).toBe('Jour');
    const out = el.querySelectorAll<HTMLButtonElement>('.zoom-button')[0];
    out.click();
    out.click();
    await fixture.whenStable();
    expect(text(el.querySelector('.granularity'))).toBe('Mois');
    expect(out.disabled).toBe(true);
    await flush();
    expect(page.mock.calls.length).toBe(calls);
  });

  it('menu « Voir dans le graphe » : onglet 3 centré sur l’entrée', async () => {
    const { el, fixture } = await render(() => Promise.resolve(timelinePage({ items: items(1) })));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('pm-timeline-card button.more')!.click();
    await fixture.whenStable();
    const entries = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(entries.map((entry) => text(entry.querySelector('.menu-label')))).toEqual([
      'Ouvrir',
      'Corriger',
      'Lier',
      'Voir dans le graphe',
    ]);
    // Lier : branché sur l'éditeur de lien (features/graph), raccourci L, plus « bientôt disponible ».
    expect(entries[2].getAttribute('aria-disabled')).not.toBe('true');
    expect(text(entries[2].querySelector('.menu-hint'))).toBe('L');
    expect(text(entries[2])).not.toContain('bientôt');
    entries[3].click();
    expect(navigate).toHaveBeenCalledWith(['/patients', 'p-1', 'graph'], {
      queryParams: { root: 'e-0' },
    });
  });

  it('départ de l’onglet : l’état est rangé dans le shell ; retour : repris', async () => {
    const { fixture, shell } = await render(() =>
      Promise.resolve(timelinePage({ items: items(3) })),
    );
    fixture.destroy();
    expect(shell.rememberTab).toHaveBeenCalledWith(
      'timeline',
      expect.objectContaining({
        patientId: 'p-1',
        total: 3,
        zoom: 'week',
        filters: { filters: NO_FILTERS, modeOverride: null },
      }),
    );
    const snapshot = shell.rememberTab.mock.calls[0][1] as TimelineSnapshot;

    TestBed.resetTestingModule();
    const again = await render(() => never(), shellMock(snapshot));
    expect(again.el.querySelectorAll('pm-timeline-card')).toHaveLength(3);
  });

  it('?focus=<id> : l’entrée est trouvée, sélectionnée, le paramètre retiré', async () => {
    const { pages } = pagedTimeline(500);
    const page = vi.fn((_id: string, query: TimelineQuery) =>
      Promise.resolve(pages.get(query.cursor)!),
    );
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const { fixture } = await render(page, shellMock(), 'e-450');
    await flush();
    await fixture.whenStable();
    const calls = page.mock.calls.map(([, query]) => query.cursor);
    expect(calls).toContain('c2');
    const instance = fixture.componentInstance as unknown as {
      store: { selectedId(): string | null; anchor(): number };
    };
    expect(instance.store.selectedId()).toBe('e-450');
    expect(instance.store.anchor()).toBe(450);
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { focus: null }, replaceUrl: true }),
    );
    navigate.mockRestore();
  });

  it('puce de filtre : la plage filtrée est relue, l’URL réécrite (replaceUrl)', async () => {
    const page = vi.fn().mockResolvedValue(
      timelinePage({
        items: items(2),
        facets: { types: { note: 2, feeling: 1 }, emotions: { anxiety: 1 }, tags: {} },
      }),
    );
    const { el, fixture } = await render(page);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const anxiety = el.querySelector<HTMLButtonElement>('button[data-emotion="anxiety"]')!;
    expect(text(anxiety)).toBe('Anxiété 1');
    anxiety.click();
    await flush();
    await fixture.whenStable();
    expect(page).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ emotions: ['anxiety'], cursor: null }),
    );
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ emotion: ['anxiety'], types: null, mode: null }),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    );
    expect(el.querySelector('button[data-emotion="anxiety"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('URL ?emotion=&drafts= : filtres repris au chargement (rechargement, lien partagé)', async () => {
    const page = vi.fn().mockResolvedValue(timelinePage({ items: items(1) }));
    const { el } = await render(page, shellMock(), null, {
      params: { emotion: 'anxiety', drafts: '1' },
    });
    expect(page.mock.calls[0][1]).toEqual(
      expect.objectContaining({ emotions: ['anxiety'], draftsOnly: true }),
    );
    const drafts = [...el.querySelectorAll('button')].find((b) =>
      text(b).startsWith('Brouillons seulement'),
    );
    expect(drafts?.getAttribute('aria-pressed')).toBe('true');
  });

  it('vide avec des filtres : « Aucune entrée pour ces filtres », Effacer les filtres', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce(
        timelinePage({ items: [], facets: { types: {}, emotions: {}, tags: {} } }),
      )
      .mockResolvedValue(timelinePage({ items: items(2) }));
    const { el, fixture } = await render(page, shellMock(), null, {
      params: { emotion: 'anxiety' },
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const empty = el.querySelector('pm-state [role="status"]');
    expect(text(empty)).toContain('Aucune entrée pour ces filtres');
    empty!.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    await fixture.whenStable();
    expect(page).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ emotions: [] }));
    expect(el.querySelectorAll('pm-timeline-card')).toHaveLength(2);
  });

  it('préférence « par séance » : séances dépliables, ligne d’état, pas de zoom', async () => {
    const session = timelineItem({
      id: 's-1',
      type: 'session',
      title: null,
      sessionId: null,
      occurred: { from: '2026-10-30T15:00:00Z', to: null, precision: 'exact', label: null },
    });
    const note = timelineItem({ id: 'a', title: 'Point sur le sommeil', sessionId: 's-1' });
    const { el } = await render(
      () =>
        Promise.resolve(
          timelinePage({
            items: [session, note],
            facets: { types: { session: 1, note: 1 }, emotions: {}, tags: {} },
          }),
        ),
      shellMock(),
      null,
      { prefs: prefsMock('session') },
    );
    expect(el.querySelector('pm-timeline-sessions')).not.toBeNull();
    expect(el.querySelector('cdk-virtual-scroll-viewport')).toBeNull();
    expect(el.querySelector('.zoom')).toBeNull();
    expect(text(el.querySelector('.status-line .count'))).toBe('2 entrées · 1 séance');
    const toggle = el.querySelector('button.toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('button[data-mode="session"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('touche M : la préférence est écrite, le mode bascule', async () => {
    const { el, fixture, prefs } = await render(() =>
      Promise.resolve(timelinePage({ items: items(2) })),
    );
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(el.querySelector('cdk-virtual-scroll-viewport')).not.toBeNull();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }),
    );
    await flush();
    await fixture.whenStable();
    expect(prefs.set).toHaveBeenCalledWith('timeline.groupBy', 'session');
    expect(el.querySelector('pm-timeline-sessions')).not.toBeNull();
    // Le bouton fait de même dans l'autre sens.
    el.querySelector<HTMLButtonElement>('button[data-mode="chronological"]')!.click();
    await flush();
    await fixture.whenStable();
    expect(prefs.set).toHaveBeenLastCalledWith('timeline.groupBy', 'chronological');
    expect(el.querySelector('cdk-virtual-scroll-viewport')).not.toBeNull();
  });

  it('?mode=chronological l’emporte sur la préférence, sans l’écrire', async () => {
    const { el, prefs } = await render(
      () => Promise.resolve(timelinePage({ items: items(2) })),
      shellMock(),
      null,
      { prefs: prefsMock('session'), params: { mode: 'chronological' } },
    );
    expect(el.querySelector('cdk-virtual-scroll-viewport')).not.toBeNull();
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it('mémoire de l’onglet : filtres repris au retour sans paramètre d’URL', async () => {
    const { fixture, shell } = await render(() =>
      Promise.resolve(timelinePage({ items: items(3) })),
    );
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => text(b).startsWith('Brouillons seulement'),
    )!;
    button.click();
    await flush();
    fixture.destroy();
    const snapshot = shell.rememberTab.mock.calls[0][1] as TimelineSnapshot;
    expect(snapshot.filters?.filters.draftsOnly).toBe(true);

    TestBed.resetTestingModule();
    const page = vi.fn<(id: string, query: TimelineQuery) => Promise<Page>>(() => never<Page>());
    const again = await render(page, shellMock(snapshot));
    expect(again.el.querySelectorAll('pm-timeline-card')).toHaveLength(3);
    expect(page.mock.calls[0][1]).toEqual(expect.objectContaining({ draftsOnly: true }));
  });

  it('?focus= seul : les filtres de la mémoire de l’onglet ne sont pas repris', async () => {
    const { fixture, shell } = await render(() =>
      Promise.resolve(timelinePage({ items: items(3) })),
    );
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((b) => text(b).startsWith('Brouillons seulement'))!
      .click();
    await flush();
    fixture.destroy();
    const snapshot = shell.rememberTab.mock.calls[0][1] as TimelineSnapshot;
    expect(snapshot.filters?.filters.draftsOnly).toBe(true);

    TestBed.resetTestingModule();
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const page = vi.fn<(id: string, query: TimelineQuery) => Promise<Page>>(() =>
      Promise.resolve(timelinePage({ items: items(3) })),
    );
    await render(page, shellMock(snapshot), 'e-1');
    await flush();
    expect(page.mock.calls[0][1]).toEqual(expect.objectContaining({ draftsOnly: false }));
    navigate.mockRestore();
  });

  it('?focus= exclu par les filtres de l’URL : filtres retirés, on prévient, l’entrée est cherchée sans eux', async () => {
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const info = vi.spyOn(ToastService.prototype, 'info');
    const page = vi.fn((_id: string, query: TimelineQuery) =>
      Promise.resolve(
        query.emotions.length
          ? timelinePage({ items: items(2, 'f') })
          : timelinePage({ items: items(5) }),
      ),
    );
    const { fixture } = await render(page, shellMock(), 'e-3', { params: { emotion: 'anxiety' } });
    await flush();
    await fixture.whenStable();
    await flush();
    expect(page.mock.calls[0][1]).toEqual(expect.objectContaining({ emotions: ['anxiety'] }));
    expect(page).toHaveBeenLastCalledWith('p-1', expect.objectContaining({ emotions: [] }));
    expect(info).toHaveBeenCalledWith("Filtres retirés pour afficher l'entrée demandée.");
    const instance = fixture.componentInstance as unknown as {
      store: { selectedId(): string | null };
    };
    expect(instance.store.selectedId()).toBe('e-3');
    navigate.mockRestore();
    info.mockRestore();
  });
});
