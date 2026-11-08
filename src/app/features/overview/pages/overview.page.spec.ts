import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { PatientShellStore } from '../../patient-shell';
import { OverviewApi } from '../data/overview.api';
import { emptyOverview, overviewView } from '../data/overview.fixtures';
import { OverviewView } from '../data/overview.model';
import { TREND_RENDERER } from '../ui/trend-chart.component';
import { OverviewPage } from './overview.page';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

const BLOCKS = [
  'Résumé',
  "Tendance d'intensité · 90 jours",
  'À surveiller · à compléter',
  'Situations actives',
  'Traitement en cours',
  'Dernières séances',
  'Émotions dominantes · 90 jours',
  'Activité récente',
];

async function render(
  options: {
    overview?: () => Promise<OverviewView>;
    view?: 'simple' | 'complete';
    remembered?: { expanded: string[] };
  } = {},
) {
  const overview = vi.fn(options.overview ?? (() => Promise.resolve(overviewView())));
  const mode = signal(options.view ?? 'complete');
  const window = signal<'30d' | '90d' | '12m'>('90d');
  const set = vi.fn(async (key: string, value: never) => {
    if (key === 'overview.view') mode.set(value);
    if (key === 'overview.window') window.set(value);
    return null;
  });
  const shell = {
    patientId: signal('p-marie'),
    revision: signal(0),
    recallTab: vi.fn(() => options.remembered),
    rememberTab: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: OverviewApi, useValue: { overview } },
      { provide: PatientShellStore, useValue: shell },
      { provide: PreferencesStore, useValue: { overviewView: mode, overviewWindow: window, set } },
      { provide: ToastService, useValue: { warning: vi.fn() } },
      {
        provide: TREND_RENDERER,
        useValue: () =>
          Promise.resolve(() => ({
            setOption: vi.fn(),
            resize: vi.fn(),
            on: vi.fn(),
            dispose: vi.fn(),
          })),
      },
    ],
  });
  const fixture = TestBed.createComponent(OverviewPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, overview, set, shell, settle: () => settle(fixture) };
}

async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await tick();
  await fixture.whenStable();
  await tick();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Le bloc dont le titre est `heading`. */
function block(el: HTMLElement, heading: string): HTMLElement {
  const section = [...el.querySelectorAll<HTMLElement>('pm-overview-block section')].find(
    (s) => text(s.querySelector('h3')) === heading,
  );
  if (!section) throw new Error(`bloc introuvable : ${heading}`);
  return section;
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => text(b) === name);
  if (!found) throw new Error(`bouton introuvable : ${name}`);
  return found;
}

function link(root: HTMLElement, name: string): HTMLAnchorElement {
  const found = [...root.querySelectorAll('a')].find((a) => text(a).startsWith(name));
  if (!found) throw new Error(`lien introuvable : ${name}`);
  return found;
}

describe('OverviewPage', () => {
  it('chargement : chaque bloc garde son titre et montre un squelette', async () => {
    const { el, overview } = await render({ overview: () => never() });
    expect(overview).toHaveBeenCalledWith('p-marie', '90d');
    for (const heading of BLOCKS) {
      expect(block(el, heading).querySelector('[aria-busy="true"]')).not.toBeNull();
    }
  });

  it('vide (patient sans données) : chaque bloc a son état vide, le résumé ses zéros', async () => {
    const { el } = await render({ overview: () => Promise.resolve(emptyOverview()) });
    const empties: Record<string, string> = {
      "Tendance d'intensité · 90 jours": 'Pas encore de ressentis sur cette période',
      'À surveiller · à compléter': 'Rien à signaler',
      'Situations actives': 'Aucune situation en cours',
      'Traitement en cours': 'Aucun traitement en cours',
      'Dernières séances': 'Aucune séance',
      'Émotions dominantes · 90 jours': "Pas d'émotion dominante",
      'Activité récente': 'Aucune entrée pour le moment',
    };
    for (const [heading, title] of Object.entries(empties)) {
      const section = block(el, heading);
      expect(section.querySelector('[role="status"]')).not.toBeNull();
      expect(text(section)).toContain(title);
    }
    const summary = block(el, 'Résumé');
    expect(summary.querySelector('pm-state')).toBeNull();
    expect([...summary.querySelectorAll('.figure')].map((f) => text(f))).toEqual([
      '0',
      '0',
      '—',
      '0',
    ]);
  });

  it('erreur : chaque bloc en erreur avec « Réessayer », qui relit la synthèse', async () => {
    let calls = 0;
    const { el, overview, settle } = await render({
      overview: () =>
        ++calls === 1
          ? Promise.reject({ status: 500, code: 'INTERNAL_ERROR' })
          : Promise.resolve(overviewView()),
    });
    for (const heading of BLOCKS) {
      expect(block(el, heading).querySelector('[role="alert"]')).not.toBeNull();
    }
    expect(text(block(el, "Tendance d'intensité · 90 jours"))).toContain('Tendance indisponible');
    button(block(el, 'Situations actives'), 'Réessayer').click();
    await settle();
    expect(overview).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(text(block(el, 'Situations actives'))).toContain('Surcharge au travail');
  });

  it('chargé : tuiles chiffrées, tendance (résumé accessible, données), émotions avec variation', async () => {
    const { el } = await render();
    const figures = [...block(el, 'Résumé').querySelectorAll('.figure')].map((f) => text(f));
    expect(figures).toEqual(['31', '2', '7,0/10', '1']);
    expect(text(block(el, 'Résumé'))).toContain('dont 1 sur 90 j');

    const trend = block(el, "Tendance d'intensité · 90 jours");
    const figure = trend.querySelector('[role="img"]');
    expect(figure?.getAttribute('aria-label')).toContain('de 5,5 à 7,0 sur 10');
    expect(figure?.getAttribute('aria-label')).toContain('Ressentis sur la période : 2');
    expect(text(trend.querySelector('.legend'))).toContain('Peur');
    const rows = [...trend.querySelectorAll('tbody tr')].map((r) => text(r));
    expect(rows[0]).toContain('Anxiété');
    expect(link(trend, 'Anxiété').getAttribute('href')).toBe('/?entry=f-1');

    const emotions = block(el, 'Émotions dominantes · 90 jours');
    const items = [...emotions.querySelectorAll('li')].map((li) =>
      [...li.querySelectorAll('a, strong, .delta, .sr-only')].map((n) => text(n)),
    );
    expect(items).toEqual([
      ['Anxiété', '18', '+6', '6 de plus que les 90 jours précédents'],
      ['Joie', '2', '−2', '2 de moins que les 90 jours précédents'],
    ]);
    expect(link(emotions, 'Anxiété').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?emotion=anxiety',
    );
  });

  it('situation active : métriques et « Voir dans le graphe » → graph?root=<id>', async () => {
    const { el } = await render();
    const situations = block(el, 'Situations actives');
    expect(text(situations)).toContain('5 ressentis liés · intensité moy. 7,4/10 · 7 liens');
    expect(link(situations, 'Voir dans le graphe').getAttribute('href')).toBe(
      '/patients/p-marie/graph?root=e-sit',
    );
  });

  it('points d’attention : drapeau en texte, brouillons → timeline filtrée, lien vers la fiche', async () => {
    const { el } = await render({
      overview: () =>
        Promise.resolve(
          overviewView({
            drafts: {
              count: 2,
              openSession: { entryId: 's-open', startedAt: '2026-11-08T09:00:00Z' },
            },
          }),
        ),
    });
    const attention = block(el, 'À surveiller · à compléter');
    expect(text(attention)).toContain('Drapeau : À surveiller · Sommeil');
    expect(link(attention, '2 brouillons à compléter').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?drafts=1',
    );
    expect(link(attention, 'Séance du').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-open',
    );
    expect(link(attention, 'Modifier la fiche').getAttribute('href')).toBe(
      '/patients/p-marie/fiche',
    );
  });

  it('traitement en cours : molécule, dose, depuis, prescripteur', async () => {
    const { el } = await render();
    const medications = text(block(el, 'Traitement en cours'));
    expect(medications).toContain('Sertraline 75 mg · matin');
    expect(medications).toContain('en cours · depuis le 12 sept. 2026');
    expect(medications).toContain('prescrit par Dr Lemaire');
  });

  it('dernières séances : la plus récente dépliée (compte rendu entier), vers la timeline par séance', async () => {
    const { el, shell, settle } = await render();
    const sessions = block(el, 'Dernières séances');
    const toggles = [...sessions.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')];
    expect(toggles.map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(text(sessions)).toContain('Objectif : préparer l’entretien.');
    expect(link(sessions, 'Voir la séance dans la timeline').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-1',
    );
    expect(link(sessions, 'Toutes les séances').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session',
    );
    toggles[1].click();
    await settle();
    expect(text(sessions)).toContain('Point sur le sommeil.');
    expect(shell.rememberTab).toHaveBeenCalledWith('overview', { expanded: ['s-1', 's-0'] });
  });

  it('retour sur l’onglet : les séances dépliées sont reprises de la mémoire du dossier', async () => {
    const { el } = await render({ remembered: { expanded: ['s-0'] } });
    const toggles = [
      ...block(el, 'Dernières séances').querySelectorAll('button[aria-expanded]'),
    ].map((t) => t.getAttribute('aria-expanded'));
    expect(toggles).toEqual(['false', 'true']);
  });

  it('activité récente : chaque entrée ouvre l’éditeur (?entry=)', async () => {
    const { el } = await render();
    const activity = block(el, 'Activité récente');
    expect(text(activity)).toContain('brouillon');
    expect(link(activity, 'Joie après la randonnée').getAttribute('href')).toBe('/?entry=f-2');
  });

  it('sélecteur de fenêtre : écrit overview.window, la synthèse est relue avec ?window=', async () => {
    const { el, set, overview, settle } = await render();
    const group = el.querySelector<HTMLElement>('[aria-label="Période de la vue d\'ensemble"]')!;
    expect(button(group, '90 j').getAttribute('aria-pressed')).toBe('true');
    button(group, '30 j').click();
    await settle();
    expect(set).toHaveBeenCalledWith('overview.window', '30d');
    expect(overview).toHaveBeenLastCalledWith('p-marie', '30d');
    expect(button(group, '30 j').getAttribute('aria-pressed')).toBe('true');
    expect(text(el)).toContain("Tendance d'intensité · 30 jours");
  });

  it('vue simple : état provisoire « Récit : bientôt », qui mène à la vue complète', async () => {
    const { el, set, settle } = await render({ view: 'simple' });
    expect(text(el)).toContain('Récit : bientôt');
    expect(el.querySelector('pm-overview-block')).toBeNull();
    button(el, 'Afficher la vue complète').click();
    await settle();
    expect(set).toHaveBeenCalledWith('overview.view', 'complete');
    expect(el.querySelector('pm-overview-block')).not.toBeNull();
  });

  it('dernière mise à jour ; « Recalculer » seulement si la synthèse est ancienne', async () => {
    const fresh = await render({
      overview: () => Promise.resolve(overviewView({ computedAt: new Date().toISOString() })),
    });
    expect(text(fresh.el.querySelector('footer'))).toContain(
      'Dernière mise à jour de la synthèse :',
    );
    expect(fresh.el.querySelector('footer button')).toBeNull();
    TestBed.resetTestingModule();

    const old = new Date(Date.now() - 20 * 60_000).toISOString();
    const { el, overview, settle } = await render({
      overview: () => Promise.resolve(overviewView({ computedAt: old })),
    });
    button(el.querySelector('footer')!, 'Recalculer').click();
    await settle();
    expect(overview).toHaveBeenCalledTimes(2);
  });

  it('après une écriture depuis le dossier (événement du shell), la vue se recharge', async () => {
    const { overview, shell, settle } = await render();
    shell.revision.set(1);
    await settle();
    expect(overview).toHaveBeenCalledTimes(2);
  });
});
