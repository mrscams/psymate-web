import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
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
    overview?: (patientId: string, window: string) => Promise<OverviewView>;
    view?: 'simple' | 'complete';
    remembered?: { expanded: string[] };
    prefsLoaded?: boolean;
  } = {},
) {
  // Par défaut, le serveur répond pour la fenêtre demandée.
  const overview = vi.fn(
    options.overview ??
      ((_: string, window: string) =>
        Promise.resolve(overviewView({ window: window as OverviewView['window'] }))),
  );
  const loaded = signal(options.prefsLoaded ?? true);
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
    currentSession: signal<{ id: string } | null>(null),
    recallTab: vi.fn(() => options.remembered),
    rememberTab: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: OverviewApi, useValue: { overview } },
      { provide: PatientShellStore, useValue: shell },
      {
        provide: PreferencesStore,
        useValue: {
          overviewView: mode,
          overviewWindow: window,
          set,
          loaded,
          status: signal('idle'),
        },
      },
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
  return { fixture, el, overview, set, shell, loaded, settle: () => settle(fixture) };
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
    // Un espace entre le motif et la date de pose (« Sommeilposé » avant M7-04).
    expect(text(attention)).toMatch(/Sommeil posé le /);
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

  it('vue simple (défaut) : le récit à la place des blocs chiffrés, sur la même synthèse', async () => {
    const { el, overview } = await render({ view: 'simple' });
    expect(overview).toHaveBeenCalledTimes(1);
    expect(el.querySelector('pm-overview-simple')).not.toBeNull();
    expect(text(el)).not.toContain('Récit : bientôt');
    const headings = [...el.querySelectorAll('pm-overview-block h3')].map((h) => text(h));
    expect(headings).toContain('En bref');
    expect(headings).not.toContain('Résumé');
    expect(text(el.querySelector('.sentence'))).toBe(
      'Suivi depuis le 12 mars 2025 : 31 séances, soit environ une séance par semaine.',
    );
    // Le sélecteur de fenêtre et le pied restent communs aux deux vues.
    expect(el.querySelector('.windows')).not.toBeNull();
    expect(text(el.querySelector('footer'))).toContain('Dernière mise à jour de la synthèse');
  });

  it('bascule simple ↔ complète : aucune nouvelle lecture de la synthèse', async () => {
    const { el, overview, set, settle } = await render({ view: 'simple' });
    // La bascule vit dans l'en-tête (shell) ; ici, la préférence change comme elle l'écrirait.
    await set('overview.view', 'complete' as never);
    await settle();
    expect(el.querySelector('pm-overview-simple')).toBeNull();
    expect(text(block(el, 'Situations actives'))).toContain('Surcharge au travail');
    await set('overview.view', 'simple' as never);
    await settle();
    expect(el.querySelector('pm-overview-simple')).not.toBeNull();
    expect(overview).toHaveBeenCalledTimes(1);
  });

  it('vue simple : un point du graphe ou une entrée ouvre l’éditeur (?entry=)', async () => {
    const { fixture, el, settle } = await render({ view: 'simple' });
    const simple = fixture.debugElement.query((d) => d.name === 'pm-overview-simple');
    simple.componentInstance.entrySelected.emit('f-1');
    await settle();
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/?entry=f-1');
    expect(el.querySelector('pm-overview-simple')).not.toBeNull();
  });

  it('dernière mise à jour : heure du calcul (computedAt), région d’état permanente, sans « Recalculer »', async () => {
    const { el } = await render({
      overview: () => Promise.resolve(overviewView({ computedAt: '2020-01-01T10:00:00Z' })),
    });
    const footer = el.querySelector('footer')!;
    expect(footer.getAttribute('role')).toBe('status');
    expect(text(footer)).toMatch(/^Dernière mise à jour de la synthèse : 1 janv. 2020/);
    // Le contrat : la réponse n'est jamais obsolète (projection recalculée à la volée).
    expect(footer.querySelector('button')).toBeNull();
    expect(text(el)).not.toContain('Recalculer');
  });

  it('après une écriture depuis le dossier (événement du shell), la vue se recharge', async () => {
    const { overview, shell, settle } = await render();
    shell.revision.set(1);
    await settle();
    expect(overview).toHaveBeenCalledTimes(2);
  });

  it('relecture en échec : la synthèse précédente reste, un bandeau « Réessayer » le dit', async () => {
    let calls = 0;
    const { el, shell, overview, settle } = await render({
      overview: () =>
        ++calls === 2
          ? Promise.reject({ status: 500, code: 'INTERNAL_ERROR' })
          : Promise.resolve(overviewView()),
    });
    shell.revision.set(1);
    await settle();
    const banner = el.querySelector<HTMLElement>('.reload-failed [role="alert"]');
    expect(text(banner)).toContain("La synthèse n'a pas pu être relue");
    // Les blocs gardent leur contenu (pas d'erreur par bloc).
    expect(text(block(el, 'Situations actives'))).toContain('Surcharge au travail');
    expect(block(el, 'Situations actives').querySelector('[role="alert"]')).toBeNull();
    button(banner!, 'Réessayer').click();
    await settle();
    expect(overview).toHaveBeenCalledTimes(3);
    expect(el.querySelector('.reload-failed')).toBeNull();
  });

  it('fenêtre en cours de lecture : les titres suivent la synthèse affichée, pas la préférence', async () => {
    const next = deferred<OverviewView>();
    let calls = 0;
    const { el, settle } = await render({
      overview: () => (++calls === 1 ? Promise.resolve(overviewView()) : next.promise),
    });
    const group = el.querySelector<HTMLElement>('.windows')!;
    button(group, '1 an').click();
    await settle();
    expect(button(group, '1 an').getAttribute('aria-pressed')).toBe('true');
    expect(text(el)).toContain("Tendance d'intensité · 90 jours");
    expect(text(el)).toContain('Émotions dominantes · 90 jours');
    expect(block(el, "Tendance d'intensité · 90 jours").getAttribute('aria-busy')).toBe('true');
    next.resolve(overviewView({ window: '12m' }));
    await settle();
    expect(text(el)).toContain("Tendance d'intensité · 12 mois");
    expect(text(el)).toContain('Émotions dominantes · 12 mois');
  });

  it('relecture : un bloc vide reste vide, il ne repasse pas au squelette', async () => {
    let calls = 0;
    const { el, shell, settle } = await render({
      overview: () => (++calls === 1 ? Promise.resolve(emptyOverview()) : never()),
    });
    shell.revision.set(1);
    await settle();
    const situations = block(el, 'Situations actives');
    expect(situations.getAttribute('aria-busy')).toBe('true');
    expect(text(situations)).toContain('Aucune situation en cours');
    expect(situations.querySelector('.state.loading')).toBeNull();
  });

  it('préférences pas encore lues : ni requête ni vue simple ; lues → une seule lecture', async () => {
    const { el, overview, loaded, settle } = await render({ prefsLoaded: false });
    expect(overview).not.toHaveBeenCalled();
    expect(el.querySelector('pm-overview-simple')).toBeNull();
    expect(el.querySelector('pm-overview-block')).toBeNull();
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    loaded.set(true);
    await settle();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(el.querySelector('pm-overview-block')).not.toBeNull();
  });

  it('« Démarrer la séance » (séance ouverte dans l’en-tête) : la séance précédente se replie', async () => {
    const { el, shell, settle } = await render();
    const states = () =>
      [...block(el, 'Dernières séances').querySelectorAll('button[aria-expanded]')].map((b) =>
        b.getAttribute('aria-expanded'),
      );
    expect(states()).toEqual(['true', 'false']);
    shell.currentSession.set({ id: 's-new' });
    await settle();
    expect(states()).toEqual(['false', 'false']);
    expect(shell.rememberTab).toHaveBeenCalledWith('overview', { expanded: [] });
  });
});
