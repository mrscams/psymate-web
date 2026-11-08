import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { emptyOverview, overviewView } from '../data/overview.fixtures';
import { OverviewView } from '../data/overview.model';
import { OverviewSimpleComponent } from './overview-simple.component';
import { TREND_RENDERER } from './trend-chart.component';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const HEADINGS = [
  'En bref',
  'Comment évoluent les ressentis',
  'Dernière séance',
  'Situations en cours',
  'Depuis la dernière séance',
  'Traitement',
  'Cadre du suivi',
  'À compléter',
];

/** Patient sans entrée, tel que l'API le renvoie (sonde du 8 nov. 2026 contre l'API locale). */
function noEntryPatient(): OverviewView {
  return emptyOverview({
    facts: { age: null, followedSince: '2026-11-08', sessionCount: 0, flags: [], medications: [] },
    narrative: {
      sentences: [
        'Suivi depuis le 8 novembre 2026 : aucune séance.',
        'Pas assez de ressentis pour dégager une tendance.',
      ],
      attention: null,
    },
  });
}

async function render(overview: Loadable<OverviewView>, refreshing = false) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
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
  const fixture = TestBed.createComponent(OverviewSimpleComponent);
  fixture.componentRef.setInput('overview', overview);
  fixture.componentRef.setInput('patientId', 'p-marie');
  fixture.componentRef.setInput('refreshing', refreshing);
  const retried: number[] = [];
  fixture.componentInstance.retry.subscribe(() => retried.push(1));
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, retried, settle: () => settle(fixture) };
}

async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await tick();
  await fixture.whenStable();
  await tick();
}

/** Éléments qui séparent visuellement leur texte de celui d'à côté (bloc, cellule, lien). */
const SEPARATED = 'p, li, div, h3, h4, header, td, th, a, button, pm-state';

/** Texte lu d'un élément, un espace entre deux éléments séparés, espaces normalisés. */
function text(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  for (const node of copy.querySelectorAll(SEPARATED)) {
    node.before(' ');
    node.after(' ');
  }
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function blocks(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('pm-overview-block section')];
}

/** Le bloc dont le titre commence par `heading`. */
function block(el: HTMLElement, heading: string): HTMLElement {
  const section = blocks(el).find((s) => text(s.querySelector('h3')).startsWith(heading));
  if (!section) throw new Error(`bloc introuvable : ${heading}`);
  return section;
}

function link(root: HTMLElement, name: string): HTMLAnchorElement {
  const found = [...root.querySelectorAll('a')].find((a) => text(a).startsWith(name));
  if (!found) throw new Error(`lien introuvable : ${name}`);
  return found;
}

/**
 * Instantané lisible de la vue : pour chaque bloc, son titre, son état (contenu, vide, chargement,
 * erreur) et son texte. Indépendant des identifiants générés et des attributs d'Angular.
 */
function snapshot(el: HTMLElement): string[] {
  return blocks(el).map((section) => {
    const heading = text(section.querySelector('h3'));
    const state = section.querySelector('[role="alert"]')
      ? 'erreur'
      : section.querySelector('.state.loading')
        ? 'chargement'
        : section.querySelector('pm-state [role="status"]')
          ? 'vide'
          : 'contenu';
    const body = text(section).slice(heading.length).trim();
    return `${heading} | ${state} | ${body}`;
  });
}

describe('OverviewSimpleComponent', () => {
  it('chargement : chaque bloc garde son titre et montre un squelette', async () => {
    const { el } = await render(loading(idle()));
    expect(blocks(el).map((s) => text(s.querySelector('h3')))).toEqual(HEADINGS);
    for (const section of blocks(el)) {
      expect(section.querySelector('[aria-busy="true"]')).not.toBeNull();
    }
  });

  it('erreur : chaque bloc en erreur avec « Réessayer », qui demande une relecture', async () => {
    const { el, retried } = await render(failed({ status: 500, code: 'INTERNAL_ERROR' } as never));
    for (const section of blocks(el)) {
      expect(section.querySelector('[role="alert"]')).not.toBeNull();
    }
    expect(text(block(el, 'En bref'))).toContain('Résumé indisponible');
    const retry = [...block(el, 'Traitement').querySelectorAll('button')].find(
      (b) => text(b) === 'Réessayer',
    );
    retry!.click();
    expect(retried).toHaveLength(1);
  });

  it('vide (patient sans entrée) : instantané de la vue', async () => {
    const { el } = await render(loaded(noEntryPatient()));
    expect(snapshot(el)).toEqual([
      'En bref | contenu | Assemblé à partir des entrées, par règles, sans IA Suivi depuis le 8 novembre 2026 : aucune séance. Pas assez de ressentis pour dégager une tendance.',
      'Comment évoluent les ressentis · 90 jours | vide | Pas encore de ressentis sur cette période Chaque ressenti noté apparaîtra ici, avec son intensité sur 10.',
      "Dernière séance | vide | Toutes les séances dans la timeline Aucune séance La dernière séance et son compte rendu apparaîtront ici dès la première, démarrée depuis l'en-tête.",
      'Situations en cours | vide | Aucune situation en cours Les situations sans fin connue apparaîtront ici, avec leurs ressentis liés.',
      'Dernières entrées | vide | Rien de noté depuis Les entrées notées après la dernière séance clôturée apparaîtront ici.',
      'Traitement | vide | Aucun traitement en cours Les médicaments notés dans le dossier, sans date de fin passée, apparaîtront ici.',
      'Cadre du suivi | contenu | Modifier la fiche Suivi depuis le 8 nov. 2026 Aucune séance',
      'À compléter | vide | Rien à compléter Les brouillons et les séances non clôturées apparaîtront ici.',
    ]);
  });

  it('vide sans phrase ni point d’attention : « En bref » a son état vide ; cadre vide sans données', async () => {
    const { el } = await render(loaded(emptyOverview()));
    expect(text(block(el, 'En bref'))).toContain('Pas encore de résumé');
    expect(block(el, 'En bref').querySelector('pm-state [role="status"]')).not.toBeNull();
    expect(text(block(el, 'Cadre du suivi'))).toContain('Cadre non renseigné');
  });

  it('En bref : chaque phrase du serveur telle quelle, dans son ordre, et le point d’attention', async () => {
    const view = overviewView();
    const { el } = await render(loaded(view));
    const brief = block(el, 'En bref');
    const sentences = [...brief.querySelectorAll('.sentence')].map((p) => p.textContent);
    expect(sentences).toEqual(view.narrative.sentences);
    expect(text(brief.querySelector('.attention'))).toBe(
      "Point d'attention : À surveiller depuis le 3 octobre 2026 (motif : Sommeil).",
    );
  });

  it('ressentis réels : titre avec la fenêtre, description accessible, légende, données', async () => {
    const { el } = await render(loaded(overviewView()));
    const feelings = block(el, 'Comment évoluent les ressentis · 90 jours');
    expect(feelings.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Ressentis notés sur 90 jours, une valeur par point : Anxiété (ressentis : 1) à 8 sur 10 ; ' +
        'Joie (ressentis : 1) à 4 sur 10. Jours de séance : 2 ; repères de médicament : 1.',
    );
    const legend = [...feelings.querySelectorAll('.legend li')].map((li) => text(li));
    expect(legend).toEqual([
      'Anxiété (1 ressenti)',
      'Joie (1 ressenti)',
      'Séance',
      'Début de traitement · Sertraline 75 mg · 12 sept. 2026',
    ]);
    const rows = [...feelings.querySelectorAll('tbody tr')].map((r) => text(r));
    expect(rows).toEqual(['20 oct. 2026 Anxiété 8/10', '7 nov. 2026 Joie 4/10']);
    expect(link(feelings, 'Anxiété').getAttribute('href')).toBe('/?entry=f-1');
  });

  it('dernière séance : compte rendu entier, entrées, timeline ; séances précédentes en une ligne', async () => {
    const { el } = await render(loaded(overviewView()));
    const session = block(el, 'Dernière séance');
    expect(text(session.querySelector('.session-head'))).toBe(
      'samedi 17 octobre 2026 · 50 min · Présentiel',
    );
    expect(session.querySelector('.summary')?.textContent).toBe(
      'Reprise du thème du travail.\nObjectif : préparer l’entretien.',
    );
    expect(text(session)).toContain('Noté pendant la séance : 4 entrées');
    expect(link(session, 'Voir la séance dans la timeline').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-1',
    );
    expect(link(session, 'Toutes les séances dans la timeline').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session',
    );
    expect(text(session.querySelector('.previous li'))).toBe(
      '10 oct. 2026 (Visio) — Point sur le sommeil.',
    );
    expect(link(session, '10 oct. 2026').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-0',
    );
  });

  it('dernière séance ouverte, sans compte rendu : elle le dit', async () => {
    const view = overviewView();
    const open = { ...view.recentSessions[0], closedAt: null, summary: null };
    const { el } = await render(loaded({ ...view, recentSessions: [open] }));
    const session = block(el, 'Dernière séance');
    expect(text(session)).toContain('Séance en cours, non clôturée.');
    expect(text(session)).toContain('Pas de compte rendu.');
    expect(session.querySelector('.previous')).toBeNull();
  });

  it('situations en cours : données du serveur et « Voir dans le graphe » → graph?root=', async () => {
    const { el } = await render(loaded(overviewView()));
    const situations = block(el, 'Situations en cours');
    expect(text(situations.querySelector('li'))).toBe(
      'Surcharge au travail, depuis le 1 avr. 2026 — 5 ressentis liés · intensité moyenne 7,4/10 ' +
        'Voir dans le graphe : Surcharge au travail',
    );
    expect(link(situations, 'Voir dans le graphe').getAttribute('href')).toBe(
      '/patients/p-marie/graph?root=e-sit',
    );
  });

  it('depuis la dernière séance : date de la séance, entrées vers l’éditeur, brouillon signalé', async () => {
    const { el } = await render(loaded(overviewView()));
    const since = block(el, 'Depuis la séance du 17 oct. 2026');
    const items = [...since.querySelectorAll('li')].map((li) => text(li));
    expect(items[0]).toContain('7 nov. 2026 Joie après la randonnée brouillon');
    expect(items[1]).toContain('22 oct. 2026 Note');
    expect(link(since, 'Joie après la randonnée').getAttribute('href')).toBe('/?entry=f-2');
  });

  it('sans séance clôturée : « Dernières entrées »', async () => {
    const view = overviewView();
    const { el } = await render(
      loaded({
        ...view,
        sinceLastSession: { ...view.sinceLastSession, lastSessionId: null, lastSessionAt: null },
      }),
    );
    expect(text(block(el, 'Dernières entrées'))).toContain('Joie après la randonnée');
  });

  it('traitement, cadre du suivi et à compléter', async () => {
    const view = overviewView({
      drafts: { count: 2, openSession: { entryId: 's-open', startedAt: '2026-11-08T09:00:00Z' } },
    });
    const { el } = await render(loaded(view));
    expect(text(block(el, 'Traitement'))).toBe(
      'Traitement Sertraline 75 mg · matin · depuis le 12 sept. 2026 · prescrit par Dr Lemaire',
    );
    const frame = block(el, 'Cadre du suivi');
    expect([...frame.querySelectorAll('li')].map((li) => text(li))).toEqual([
      'Suivi depuis le 12 mars 2025',
      '31 séances au total',
      'Drapeau « À surveiller » posé le 3 oct. 2026 : Sommeil',
    ]);
    expect(link(frame, 'Modifier la fiche').getAttribute('href')).toBe('/patients/p-marie/fiche');
    const todo = block(el, 'À compléter');
    expect(link(todo, '2 brouillons à relire').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?drafts=1',
    );
    expect(link(todo, 'Séance du 8 nov. 2026 à clôturer').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-open',
    );
  });

  it('« Reçu du patient » (B9) : place réservée, rien de dessiné', async () => {
    const { el } = await render(loaded(overviewView()));
    expect(text(el)).not.toContain('Reçu du patient');
    const side = [...el.querySelectorAll('.side > pm-overview-block h3')].map((h) => text(h));
    expect(side).toEqual([
      'Depuis la séance du 17 oct. 2026',
      'Traitement',
      'Cadre du suivi',
      'À compléter',
    ]);
  });

  it('relecture : le contenu reste affiché, chaque bloc est marqué occupé', async () => {
    const { el } = await render(loading(loaded(overviewView())), true);
    const brief = block(el, 'En bref');
    expect(brief.getAttribute('aria-busy')).toBe('true');
    expect(brief.querySelectorAll('.sentence')).toHaveLength(3);
  });
});
