import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { PatientShellStore } from '../../patient-shell';
import { GraphApi } from '../data/graph.api';
import { edge, expansion, graphView, node, superNode } from '../data/graph.fixtures';
import { GraphView } from '../data/graph.model';
import { GraphSnapshot } from '../data/graph.store';
import { LinkApi } from '../data/link.api';
import { CATALOG, link, source } from '../data/link.fixtures';
import { provideTestLayout } from '../ui/graph-layout.fixtures';
import { GraphPage } from './graph.page';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const never = <T>() => new Promise<T>(() => undefined);
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function shellMock(snapshot?: GraphSnapshot) {
  // Compteur des écritures du dossier : noteWrite l'avance, comme le vrai PatientShellStore.
  const revision = signal(0);
  return {
    patient: signal({ id: 'p-1', displayName: 'Lina T.' }),
    recallTab: vi.fn().mockReturnValue(snapshot),
    rememberTab: vi.fn(),
    revision,
    noteWrite: vi.fn(() => revision.update((value) => value + 1)),
  };
}

interface Setup {
  neighbourhood?: (...args: unknown[]) => Promise<GraphView>;
  defaultRoot?: (...args: unknown[]) => Promise<string | null>;
  expand?: (...args: unknown[]) => Promise<GraphView>;
  linkTypes?: (...args: unknown[]) => Promise<unknown>;
  shell?: ReturnType<typeof shellMock>;
  url?: string;
}

async function render(setup: Setup = {}) {
  const graphApi = {
    neighbourhood: vi.fn(setup.neighbourhood ?? (() => Promise.resolve(graphView()))),
    expand: vi.fn(setup.expand ?? (() => Promise.resolve(expansion()))),
    emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
    defaultRoot: vi.fn(setup.defaultRoot ?? (() => Promise.resolve(null))),
  };
  const linkApi = {
    linkTypes: vi.fn(setup.linkTypes ?? (() => Promise.resolve(CATALOG))),
    entry: vi.fn((id: string) => Promise.resolve(source({ id }))),
    linksOf: vi.fn().mockResolvedValue([link()]),
    targets: vi.fn().mockResolvedValue([]),
  };
  const shell = setup.shell ?? shellMock();
  vi.stubGlobal(
    'matchMedia',
    // prefers-reduced-motion (layout sans animation) ; écran large (légende dépliée).
    vi.fn((query: string) => ({
      matches: query.includes('reduced-motion'),
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
      provideTestLayout(),
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
  /** La carte d'une entrée (ou d'un super-nœud) dans le canevas. */
  const card = (id: string) => el.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  const cards = () => el.querySelectorAll('[data-node-id]');
  return { harness, el, graphApi, linkApi, shell, button, card, cards };
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await tick();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }
}

const url = () => TestBed.inject(Router).url;

/** Choisit une période dans le menu « Période : … » (mat-menu, dans l'overlay). */
async function choosePeriod(
  el: HTMLElement,
  harness: RouterTestingHarness,
  label: string,
): Promise<void> {
  [...el.querySelectorAll<HTMLButtonElement>('.toolbar .filter')]
    .find((b) => text(b).startsWith('Période'))!
    .click();
  await settle(harness);
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    .find((b) => text(b).endsWith(label))!
    .click();
  await settle(harness);
}

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
    // Pas de « 0 nœuds · 0 liens » avant la première lecture.
    expect(text(el.querySelector('.count'))).toBe('');
  });

  it('erreur 5xx : Réessayer relit le graphe', async () => {
    const neighbourhood = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue(graphView());
    const { el, harness, button, graphApi } = await render({ neighbourhood });
    expect(text(el.querySelector('.board [role="alert"]'))).toContain(
      'Impossible de charger le graphe',
    );
    expect(text(el.querySelector('.count'))).toBe('');
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
    expect(url()).toBe('/patients/p-1/graph?root=all');
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ root: null }),
    );
  });

  it('422 sur root (DIFFERENT_PATIENT) : « Voir tout le dossier », pas « Filtres par défaut »', async () => {
    const neighbourhood = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'root', code: 'DIFFERENT_PATIENT', message: 'Autre patient.' }],
      })
      .mockResolvedValue(graphView());
    const { el, harness, button } = await render({ neighbourhood });
    expect(text(el.querySelector('.board [role="alert"]'))).toContain(
      "Cette entrée n'appartient pas à ce dossier",
    );
    expect(button('Filtres par défaut')).toBeUndefined();
    button('Voir tout le dossier').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=all');
  });

  it('422 sur les filtres : « Filtres par défaut » (profondeur par défaut, sans période)', async () => {
    const neighbourhood = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'linkTypes', code: 'INVALID_VALUE', message: 'Type inconnu.' }],
      })
      .mockResolvedValue(graphView());
    const { el, harness, button } = await render({
      neighbourhood,
      url: '/patients/p-1/graph?root=e-situation&depth=3&period=90d&linkTypes=treats',
    });
    expect(text(el.querySelector('.board [role="alert"]'))).toContain('Type inconnu.');
    button('Filtres par défaut').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
  });

  it('relecture en échec : le dernier graphe reste, alerte titrée avec Réessayer', async () => {
    const neighbourhood = vi
      .fn()
      .mockResolvedValueOnce(graphView())
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(graphView({ edges: graphView().edges.slice(0, 2) }));
    const { el, harness } = await render({ neighbourhood });
    await choosePeriod(el, harness, '30 derniers jours');
    const alert = el.querySelector('.alert[role="alert"]');
    expect(text(alert)).toContain('Impossible de charger le graphe');
    expect(text(alert)).toContain('Le dernier graphe reçu reste affiché.');
    expect(el.querySelector('pm-graph-canvas')).not.toBeNull();
    alert!.querySelector('button')!.click();
    await settle(harness);
    expect(el.querySelector('.alert[role="alert"]')).toBeNull();
    expect(text(el.querySelector('.count'))).toBe('4 nœuds · 2 liens');
  });

  it('types de liens illisibles : erreur dans la barre d’outils (hors du menu), Réessayer', async () => {
    const linkTypes = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue(CATALOG);
    const { el, harness } = await render({ linkTypes });
    const alert = el.querySelector('.toolbar .catalog-error[role="alert"]');
    expect(text(alert)).toContain('Impossible de charger les types de liens');
    alert!.querySelector('button')!.click();
    await settle(harness);
    expect(linkTypes).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.catalog-error')).toBeNull();
    expect(el.querySelector('.count')?.getAttribute('aria-live')).toBe('polite');
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
    const { el, harness, graphApi, cards } = await render();
    expect(el.querySelector('pm-graph-canvas')).not.toBeNull();
    expect(cards()).toHaveLength(4);
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

  it('lecture et sens : écrits dans l’URL, le graphe reçu est redisposé sans nouvelle requête', async () => {
    const { el, harness, graphApi, button } = await render();
    const titles = () => [...el.querySelectorAll('pm-graph-canvas .band-label')].map(text);
    expect(button('Chaîne causale').getAttribute('aria-pressed')).toBe('true');
    expect(button('Gauche → droite').getAttribute('aria-pressed')).toBe('true');
    expect(titles()).toEqual([]);

    button('Colonnes par type').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation&reading=type');
    expect(button('Colonnes par type').getAttribute('aria-pressed')).toBe('true');
    expect(titles()).toEqual([
      'Événements',
      'Situations',
      'Ressentis et notes',
      'Réponses · traitements, séances',
    ]);

    button('Haut → bas').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation&reading=type&direction=down');

    button('Chronologie').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation&reading=time&direction=down');
    expect(titles()).toEqual(['mars 2026']);

    button('Chaîne causale').click();
    await settle(harness);
    button('Gauche → droite').click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
  });

  it('« Nom des liens » : décoché, les noms quittent les traits, l’URL le retient, aucune requête', async () => {
    const { el, harness, graphApi } = await render();
    const box = el.querySelector<HTMLInputElement>('.names-toggle input')!;
    const names = () => el.querySelectorAll('pm-graph-canvas .link-name').length;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(names()).toBe(3);

    box.click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation&names=off');
    expect(names()).toBe(0);

    box.click();
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
    expect(names()).toBe(3);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
  });

  it('sans racine : profondeur désactivée ; période dans l’URL et en requête', async () => {
    const { el, harness, graphApi } = await render({ url: '/patients/p-1/graph?root=all' });
    expect(el.querySelector<HTMLButtonElement>('.segment')?.disabled).toBe(true);
    // Plus de select natif dans la barre (UX-B3) : « Période » est un menu.
    expect(el.querySelectorAll('.toolbar select')).toHaveLength(0);
    await choosePeriod(el, harness, '90 derniers jours');
    expect(url()).toBe('/patients/p-1/graph?root=all&period=90d');
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ from: expect.any(String) }),
    );
  });

  it('sans ?root= : centré sur la situation en cours la plus liée, en profondeur 2', async () => {
    const { graphApi } = await render({
      url: '/patients/p-1/graph',
      defaultRoot: () => Promise.resolve('e-situation'),
    });
    expect(graphApi.defaultRoot).toHaveBeenCalledWith('p-1');
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    expect(graphApi.neighbourhood).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ root: 'e-situation', depth: 2 }),
    );
  });

  it('sans ?root= et sans situation en cours reliée (ou synthèse illisible) : tout le dossier', async () => {
    const { graphApi } = await render({
      url: '/patients/p-1/graph?period=90d',
      defaultRoot: () => Promise.reject(serverError),
    });
    expect(url()).toBe('/patients/p-1/graph?period=90d&root=all');
    expect(graphApi.neighbourhood).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ root: null }),
    );
  });

  it('tout le dossier au-delà de 60 nœuds : avertissement « étiquettes masquées »', async () => {
    const nodes = Array.from({ length: 70 }, (_, i) =>
      node({ id: `e-${i}`, type: 'note', title: `Note ${i}` }),
    );
    const edges = nodes
      .slice(1)
      .map((item, i) => edge({ id: `l-${i}`, source: 'e-0', target: item.id }));
    const { el } = await render({
      url: '/patients/p-1/graph?root=all',
      neighbourhood: () => Promise.resolve(graphView({ nodes, edges })),
    });
    expect(text(el.querySelector('.warning-note'))).toBe(
      'Tout le dossier : 70 nœuds, étiquettes masquées. Choisissez une entrée dans « Centré sur » pour lire le graphe.',
    );
  });

  it('« Centré sur » : liste filtrable groupée par type, une entrée devient la racine', async () => {
    const { el, harness } = await render({ url: '/patients/p-1/graph?root=all' });
    const trigger = el.querySelector<HTMLButtonElement>('pm-graph-root-picker .trigger')!;
    expect(text(trigger)).toBe('Tout le dossier');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    trigger.click();
    await settle(harness);
    const listbox = el.querySelector('[role="listbox"]')!;
    const first = listbox.querySelector('[role="option"]')!;
    expect(text(first)).toBe("Tout le dossier jusqu'à 150 nœuds, étiquettes masquées");
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect([...listbox.querySelectorAll('[role="group"] .group-label')].map(text)).toEqual([
      'Événement',
      'Situation',
      'Ressenti',
      'Médicament',
    ]);
    const search = el.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(document.activeElement).toBe(search);
    search.value = 'sertra';
    search.dispatchEvent(new Event('input'));
    await settle(harness);
    const options = [...el.querySelectorAll('[role="option"]')];
    expect(options.map((option) => text(option.querySelector('.option-name')))).toEqual([
      'Sertraline 50 mg',
    ]);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(harness);
    expect(url()).toBe('/patients/p-1/graph?root=e-med');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('« Centré sur » : un texte cherche aussi dans tout le dossier (après un délai)', async () => {
    const { el, harness, linkApi } = await render({ url: '/patients/p-1/graph?root=e-situation' });
    linkApi.targets.mockResolvedValue([
      {
        id: 'e-far',
        type: 'note',
        title: null,
        excerpt: null,
        occurredFrom: '2026-10-24T10:00:00Z',
        occurredTo: null,
        precision: 'day',
      },
    ]);
    el.querySelector<HTMLButtonElement>('pm-graph-root-picker .trigger')!.click();
    await settle(harness);
    const search = el.querySelector<HTMLInputElement>('[role="combobox"]')!;
    search.value = 'note';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle(harness);
    expect(linkApi.targets).toHaveBeenCalledWith('p-1', { q: 'note', type: null });
    const names = [...el.querySelectorAll('[role="option"] .option-name')].map(text);
    expect(names.some((name) => /^Note · 24 oct\./.test(name))).toBe(true);
  });

  it('« Lier L » : source = l’entrée sélectionnée, sinon la racine ; inactif sur tout le dossier', async () => {
    const { el, harness } = await render();
    const link = el.querySelector<HTMLButtonElement>('.tool.link')!;
    expect(text(link.querySelector('span'))).toBe('Lier');
    expect(text(link.querySelector('kbd'))).toBe('L');
    expect(link.getAttribute('aria-keyshortcuts')).toBe('L');
    expect(link.getAttribute('aria-disabled')).toBeNull();
    link.click();
    await settle(harness);
    expect(url()).toContain('link=e-situation');
    expect(document.querySelector('pm-link-editor-panel')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('pm-side-panel button.close')?.click();
    await settle(harness);

    await harness.navigateByUrl('/patients/p-1/graph?root=all');
    await settle(harness);
    expect(el.querySelector('.tool.link')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('légende dépliée à l’arrivée (écran large), repliable', async () => {
    const { el, harness } = await render();
    const toggle = el.querySelector<HTMLButtonElement>('pm-graph-legend .toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#graph-legend-body')).not.toBeNull();
    toggle.click();
    await settle(harness);
    expect(el.querySelector('#graph-legend-body')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
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
    const { el, harness, graphApi, card, cards } = await render({
      neighbourhood: () =>
        Promise.resolve(graphView({ superNodes: [superNode()], truncated: true })),
    });
    expect(text(el.querySelector('.note'))).toContain('Graphe partiel');
    expect(text(el.querySelector('.count'))).toBe('5 nœuds · 3 liens');
    card('sn:e-situation:feeling').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(harness);
    expect(graphApi.expand).toHaveBeenCalledWith('p-1', 'sn:e-situation:feeling');
    expect(text(el.querySelector('.count'))).toBe('7 nœuds · 6 liens');
    expect(cards()).toHaveLength(7);
  });

  it('liste équivalente : les super-nœuds y sont, « Déplier » depuis le tableau des groupes', async () => {
    const { el, harness, button, graphApi } = await render({
      neighbourhood: () => Promise.resolve(graphView({ superNodes: [superNode()] })),
    });
    button('Liste des liens').click();
    await settle(harness);
    const groups = el.querySelector('#graph-links-list table.groups');
    expect(text(groups?.querySelector('tbody tr'))).toContain(
      '3 ressentis regroupés · anxiété majoritaire',
    );
    groups!.querySelector<HTMLButtonElement>('button.expand')!.click();
    await settle(harness);
    expect(graphApi.expand).toHaveBeenCalledWith('p-1', 'sn:e-situation:feeling');
    expect(el.querySelector('#graph-links-list table.groups')).toBeNull();
    expect(el.querySelectorAll('#graph-links-list tbody tr')).toHaveLength(6);
  });

  it('super-nœud sélectionné : panneau avec « Déplier »', async () => {
    const { el, harness, graphApi, card, button } = await render({
      neighbourhood: () => Promise.resolve(graphView({ superNodes: [superNode()] })),
    });
    card('sn:e-situation:feeling').click();
    await settle(harness);
    expect(text(el.querySelector('pm-graph-detail h2'))).toBe(
      '3 ressentis regroupés · anxiété majoritaire',
    );
    expect(text(el.querySelector('p.sr-only[aria-live="polite"]'))).toBe(
      'Groupe sélectionné : 3 ressentis regroupés · anxiété majoritaire',
    );
    button('Déplier').click();
    await settle(harness);
    expect(graphApi.expand).toHaveBeenCalledTimes(1);
    expect(el.querySelector('pm-graph-detail')).toBeNull();
  });

  it('double-clic sur une entrée : la timeline positionnée dessus', async () => {
    const { harness, card } = await render();
    card('e-event').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
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
    expect(text(el.querySelector('p.sr-only[aria-live="polite"]'))).toBe(
      'Entrée sélectionnée : Sertraline 50 mg, Médicament',
    );
  });

  it('écriture ailleurs dans le dossier (revision du shell) : le graphe est relu', async () => {
    const shell = shellMock();
    const { harness, graphApi } = await render({ shell });
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    shell.noteWrite();
    await settle(harness);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
  });

  it('glisser A sur B : éditeur de lien prérempli (source A, cible B), graphe relu à la fermeture', async () => {
    const shell = shellMock();
    const { el, harness, card, linkApi, graphApi } = await render({ shell });
    const pointer = (type: string, x: number, y: number) =>
      new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    const zone = el.querySelector<HTMLElement>('pm-graph-canvas .viewport')!;
    const start = card('e-event').style.transform;
    // jsdom ne sait pas ce qui est sous le pointeur : la carte du médicament.
    const doc = document as { elementFromPoint?: unknown };
    doc.elementFromPoint = () => card('e-med');
    card('e-event').dispatchEvent(pointer('pointerdown', 10, 10));
    zone.dispatchEvent(pointer('pointermove', 90, 30));
    zone.dispatchEvent(pointer('pointerup', 90, 30));
    delete doc.elementFromPoint;
    await settle(harness);
    expect(card('e-event').style.transform).toBe(start);
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
    expect(url()).not.toContain('link=');
    // Le shell (ici simulé) note une écriture quand ?link= quitte l'URL : le graphe se relit.
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    shell.noteWrite();
    await settle(harness);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
  });

  it('départ : l’état est rangé dans le shell ; retour sans paramètres : repris tel quel', async () => {
    const first = await render();
    first.card('e-feeling').click();
    await settle(first.harness);
    await first.harness.navigateByUrl('/patients/p-1/timeline');
    const snapshot = first.shell.rememberTab.mock.calls.at(-1)?.[1] as GraphSnapshot;
    expect(first.shell.rememberTab.mock.calls.at(-1)?.[0]).toBe('graph');
    expect(snapshot).toMatchObject({
      patientId: 'p-1',
      query: { root: 'e-situation' },
      selectedId: 'e-feeling',
    });
    expect(snapshot.viewports['e-situation']).toBeDefined();

    TestBed.resetTestingModule();
    const again = await render({ shell: shellMock(snapshot), url: '/patients/p-1/graph' });
    expect(url()).toBe('/patients/p-1/graph?root=e-situation');
    expect(text(again.el.querySelector('pm-graph-detail h2'))).toMatch(/^Anxiété 8\/10/);
    expect(again.shell.rememberTab).toHaveBeenCalledWith('graph', undefined);
    // Vue reprise : le zoom rangé pour la racine.
    const { zoom, pan } = snapshot.viewports['e-situation'];
    expect(again.el.querySelector<HTMLElement>('pm-graph-canvas .world')!.style.transform).toBe(
      `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    );
  });
});
