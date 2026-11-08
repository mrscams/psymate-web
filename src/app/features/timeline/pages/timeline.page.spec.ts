import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { PreferencesStore } from '../../../core/preferences';
import { PatientShellStore } from '../../patient-shell';
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

async function render(
  page: (id: string, query: TimelineQuery) => Promise<Page>,
  shell = shellMock(),
  focus: string | null = null,
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...(focus
        ? [
            {
              provide: ActivatedRoute,
              useValue: { queryParamMap: of(convertToParamMap({ focus })) },
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
          emotionLabels: vi.fn().mockResolvedValue({}),
        },
      },
      {
        provide: PreferencesStore,
        useValue: { defaultVisibility: signal('clinical'), medicationVisible: signal(true) },
      },
      // L'éditeur d'entrée (features/entries) lit l'API par HttpClient : requêtes en attente ici.
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(TimelinePage);
  await flush();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, shell };
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
    // Lier : présent, désactivé mais atteignable, avec son aide (éditeur de lien, M2-04).
    expect(entries[2].getAttribute('aria-disabled')).toBe('true');
    expect(text(entries[2])).toContain('bientôt disponible');
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
      expect.objectContaining({ patientId: 'p-1', total: 3, zoom: 'week' }),
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
});
