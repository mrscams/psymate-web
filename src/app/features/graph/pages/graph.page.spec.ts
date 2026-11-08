import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import cytoscape, { Core, CytoscapeOptions } from 'cytoscape';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { PatientShellStore } from '../../patient-shell';
import { GraphApi } from '../data/graph.api';
import { expansion, graphView, superNode } from '../data/graph.fixtures';
import { GraphView } from '../data/graph.model';
import { GraphSnapshot } from '../data/graph.store';
import { LinkApi } from '../data/link.api';
import { CATALOG, link, source } from '../data/link.fixtures';
import { GRAPH_RENDERER } from '../ui/graph-canvas.component';
import { GraphPage } from './graph.page';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const never = <T>() => new Promise<T>(() => undefined);
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function shellMock(snapshot?: GraphSnapshot) {
  return {
    patient: signal({ id: 'p-1', displayName: 'Lina T.' }),
    recallTab: vi.fn().mockReturnValue(snapshot),
    rememberTab: vi.fn(),
  };
}

interface Setup {
  neighbourhood?: (...args: unknown[]) => Promise<GraphView>;
  expand?: (...args: unknown[]) => Promise<GraphView>;
  shell?: ReturnType<typeof shellMock>;
  url?: string;
}

async function render(setup: Setup = {}) {
  let cy: Core | null = null;
  const graphApi = {
    neighbourhood: vi.fn(setup.neighbourhood ?? (() => Promise.resolve(graphView()))),
    expand: vi.fn(setup.expand ?? (() => Promise.resolve(expansion()))),
    emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
  };
  const linkApi = {
    linkTypes: vi.fn().mockResolvedValue(CATALOG),
    entry: vi.fn((id: string) => Promise.resolve(source({ id }))),
    linksOf: vi.fn().mockResolvedValue([link()]),
    targets: vi.fn().mockResolvedValue([]),
  };
  const shell = setup.shell ?? shellMock();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'patients/:id/graph', component: GraphPage },
        { path: 'patients/:id/timeline', children: [] },
      ]),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: PatientShellStore, useValue: shell },
      { provide: GraphApi, useValue: graphApi },
      { provide: LinkApi, useValue: linkApi },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-1' }) } },
      {
        provide: PreferencesStore,
        useValue: { defaultVisibility: signal('clinical'), medicationVisible: signal(true) },
      },
      {
        provide: GRAPH_RENDERER,
        useValue: () =>
          Promise.resolve({
            create: (options: CytoscapeOptions) => {
              cy = cytoscape({ ...options, headless: true, styleEnabled: true });
              return cy;
            },
            layout: 'grid',
          }),
      },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(setup.url ?? '/patients/p-1/graph?root=e-situation');
  await settle(harness);
  const el = harness.fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
  return { harness, el, graphApi, linkApi, shell, button, cy: () => cy as unknown as Core };
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }
}

const url = () => TestBed.inject(Router).url;

describe('GraphPage', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true);
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    vi.unstubAllGlobals();
  });

  it('chargement : squelette à la place du canevas', async () => {
    const { el } = await render({ neighbourhood: () => never() });
    expect(el.querySelector('.board pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('pm-graph-canvas')).toBeNull();
  });

  it('erreur 5xx : Réessayer relit le graphe', async () => {
    const neighbourhood = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue(graphView());
    const { el, harness, button, graphApi } = await render({ neighbourhood });
    expect(text(el.querySelector('.board [role="alert"]'))).toContain(
      'Impossible de charger le graphe',
    );
    button('Réessayer').click();
    await settle(harness);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-graph-canvas')).not.toBeNull();
  });

  it('404 de la racine : « Voir tout le dossier » retire la racine de l’URL', async () => {
    const neighbourhood = vi
      .fn()
      .mockRejectedValueOnce({ status: 404, code: 'ENTRY_NOT_FOUND' })
      .mockResolvedValue(graphView());
    const { el, harness, button, graphApi } = await render({ neighbourhood });
    expect(text(el.querySelector('.board [role="alert"]'))).toContain("Cette entrée n'existe plus");
    expect(button('Réessayer')).toBeUndefined();
    button('Voir tout le dossier').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph');
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ root: null }),
    );
  });

  it('vide : message et « Ouvrir la timeline »', async () => {
    const { el, harness, button } = await render({
      neighbourhood: () => Promise.resolve(graphView({ edges: [] })),
      url: '/patients/p-1/graph',
    });
    expect(text(el.querySelector('.board [role="status"]'))).toContain(
      'Les liens que vous créez apparaîtront ici',
    );
    button('Ouvrir la timeline').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/timeline');
  });

  it('chargé : canevas en @defer, compteur, légende, profondeur dans l’URL', async () => {
    const { el, harness, graphApi, cy } = await render();
    expect(el.querySelector('pm-graph-canvas')).not.toBeNull();
    expect(cy().nodes()).toHaveLength(4);
    expect(text(el.querySelector('.count'))).toBe('4 nœuds · 3 liens');
    expect(el.querySelector('pm-graph-legend')).not.toBeNull();
    expect(graphApi.neighbourhood).toHaveBeenCalledWith('p-1', {
      root: 'e-situation',
      depth: 2,
      linkTypes: [],
      from: null,
    });

    const depth3 = [...el.querySelectorAll<HTMLButtonElement>('.segment')][2];
    depth3.click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation&depth=3');
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ depth: 3 }),
    );
    expect(depth3.getAttribute('aria-pressed')).toBe('true');
  });

  it('sans racine : profondeur désactivée ; période dans l’URL et en requête', async () => {
    const { el, harness, graphApi } = await render({ url: '/patients/p-1/graph' });
    expect(el.querySelector<HTMLButtonElement>('.segment')?.disabled).toBe(true);
    const period = el.querySelectorAll<HTMLSelectElement>('select')[1];
    period.value = '90d';
    period.dispatchEvent(new Event('change'));
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?period=90d');
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ from: expect.any(String) }),
    );
  });

  it('« Centré sur » : une entrée du graphe devient la racine', async () => {
    const { el, harness } = await render({ url: '/patients/p-1/graph' });
    const root = el.querySelector<HTMLSelectElement>('select.root-select')!;
    const options = [...root.options].map((option) => text(option));
    expect(options[0]).toBe('Tout le dossier');
    expect(options).toContain('Sertraline 50 mg · Médicament');
    root.value = 'e-med';
    root.dispatchEvent(new Event('change'));
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-med');
  });

  it('filtre des types d’entrées : local (pas de requête), compteur mis à jour', async () => {
    const { el, harness, graphApi } = await render({
      url: '/patients/p-1/graph?root=e-situation&types=feeling',
    });
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    expect(text(el.querySelector('.count'))).toBe('2 nœuds · 1 liens');
    await harness.navigateByUrl('/patients/p-1/graph?root=e-situation');
    await settle(harness);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    expect(text(el.querySelector('.count'))).toBe('4 nœuds · 3 liens');
  });

  it('graphe tronqué : mention ; super-nœud : double-clic le déplie', async () => {
    const { el, harness, graphApi, cy } = await render({
      neighbourhood: () =>
        Promise.resolve(graphView({ superNodes: [superNode()], truncated: true })),
    });
    expect(text(el.querySelector('.note'))).toContain('Graphe partiel');
    expect(text(el.querySelector('.count'))).toBe('5 nœuds · 3 liens');
    cy().getElementById('sn:e-situation:feeling').emit('dbltap');
    await settle(harness);
    expect(graphApi.expand).toHaveBeenCalledWith('p-1', 'sn:e-situation:feeling');
    expect(text(el.querySelector('.count'))).toBe('7 nœuds · 6 liens');
    expect(cy().nodes()).toHaveLength(7);
  });

  it('super-nœud sélectionné : panneau avec « Déplier »', async () => {
    const { el, harness, graphApi, cy, button } = await render({
      neighbourhood: () => Promise.resolve(graphView({ superNodes: [superNode()] })),
    });
    cy().getElementById('sn:e-situation:feeling').emit('tap');
    await settle(harness);
    expect(text(el.querySelector('pm-graph-detail h2'))).toBe(
      '3 ressentis regroupés · anxiété majoritaire',
    );
    expect(text(el.querySelector('[aria-live="polite"]'))).toBe(
      'Groupe sélectionné : 3 ressentis regroupés · anxiété majoritaire',
    );
    button('Déplier').click();
    await settle(harness);
    expect(graphApi.expand).toHaveBeenCalledTimes(1);
    expect(el.querySelector('pm-graph-detail')).toBeNull();
  });

  it('double-clic sur une entrée : la timeline positionnée dessus', async () => {
    const { harness, cy } = await render();
    cy().getElementById('e-event').emit('dbltap');
    await settle(harness);
    expect(url()).toBe('/patients/p-1/timeline?focus=e-event');
  });

  it('liste équivalente : tableau des liens, une entrée choisie ouvre son détail (focus, annonce)', async () => {
    const { el, harness, button, linkApi } = await render();
    const toggle = button('Liste des liens');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await settle(harness);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const rows = el.querySelectorAll('#graph-links-list tbody tr');
    expect(rows).toHaveLength(3);
    rows[2].querySelector<HTMLButtonElement>('button')!.click();
    await settle(harness);
    expect(linkApi.entry).toHaveBeenCalledWith('e-med');
    expect(text(el.querySelector('pm-graph-detail h2'))).toBe('Sertraline 50 mg');
    expect(document.activeElement).toBe(el.querySelector('pm-graph-detail h2'));
    expect(text(el.querySelector('[aria-live="polite"]'))).toBe(
      'Entrée sélectionnée : Sertraline 50 mg, Médicament',
    );
  });

  it('glisser A sur B : éditeur de lien prérempli (source A, cible B), graphe relu à la fermeture', async () => {
    const { harness, cy, linkApi, graphApi } = await render();
    // Headless, la grille n'a pas de taille : on écarte les nœuds à la main.
    ['e-situation', 'e-feeling', 'e-event', 'e-med'].forEach((id, i) =>
      cy()
        .getElementById(id)
        .position({ x: i * 300, y: 0 }),
    );
    const event = cy().getElementById('e-event');
    const start = { ...event.position() };
    event.emit('grab');
    event.position({ x: 902, y: 3 });
    event.emit('dragfree');
    await settle(harness);
    expect(event.position()).toEqual(start);
    const panel = document.querySelector('pm-link-editor-panel');
    expect(panel).not.toBeNull();
    expect(url()).toContain('link=e-event');
    expect(linkApi.entry).toHaveBeenCalledWith('e-event');
    expect(linkApi.entry).toHaveBeenCalledWith('e-med');
    expect(panel?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe(
      'e-med',
    );

    document.querySelector<HTMLButtonElement>('pm-side-panel button.close')?.click();
    await settle(harness);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
  });

  it('départ : l’état est rangé dans le shell ; retour sans paramètres : repris tel quel', async () => {
    const first = await render();
    first.cy().getElementById('e-feeling').emit('tap');
    await settle(first.harness);
    await first.harness.navigateByUrl('/patients/p-1/timeline');
    const snapshot = first.shell.rememberTab.mock.calls.at(-1)?.[1] as GraphSnapshot;
    expect(first.shell.rememberTab.mock.calls.at(-1)?.[0]).toBe('graph');
    expect(snapshot).toMatchObject({
      patientId: 'p-1',
      query: { root: 'e-situation' },
      selectedId: 'e-feeling',
    });
    expect(Object.keys(snapshot.positions['e-situation'] ?? {})).toHaveLength(4);

    TestBed.resetTestingModule();
    const again = await render({ shell: shellMock(snapshot), url: '/patients/p-1/graph' });
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
    expect(text(again.el.querySelector('pm-graph-detail h2'))).toBe('Anxiété 8');
    expect(again.shell.rememberTab).toHaveBeenCalledWith('graph', undefined);
    // Positions reprises : pas de layout, le nœud est là où il était.
    expect(again.cy().getElementById('e-med').position()).toEqual(
      snapshot.positions['e-situation']['e-med'],
    );
  });
});
