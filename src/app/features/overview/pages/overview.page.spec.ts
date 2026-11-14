import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { PatientShellStore, ShellPatient } from '../../patient-shell';
import { OverviewApi } from '../data/overview.api';
import { emptyOverview, overviewView } from '../data/overview.fixtures';
import { OverviewView } from '../data/overview.model';
import { TREND_RENDERER } from '../ui/chart-host';
import { OverviewFeelingsComponent } from '../ui/overview-feelings.component';
import { OverviewPage } from './overview.page';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Les sections de la colonne de lecture, dans l'ordre de la proposition 02. */
const MAIN = [
  'Comment évoluent les ressentis',
  'Noté depuis la dernière séance',
  'Dernières séances',
];
/** Les blocs de la colonne latérale, dans l'ordre de la proposition 02. */
const SIDE = [
  'Cadre du suivi',
  'Traitement en cours',
  'Situations en cours',
  'Émotions · 90 jours',
  'À compléter',
];

const marie: ShellPatient = {
  id: 'p-marie',
  displayName: 'Marie D.',
  birthDate: null,
  followedSince: '2025-03-12',
  flags: ['watch'],
  sessionModality: 'in_person',
  plannedDurationMin: 50,
};

async function render(
  options: {
    overview?: (patientId: string, window: string) => Promise<OverviewView>;
    prefsLoaded?: boolean;
    remembered?: { showData: boolean };
  } = {},
) {
  // Par défaut, le serveur répond pour la fenêtre demandée.
  const overview = vi.fn(
    options.overview ??
      ((_: string, window: string) =>
        Promise.resolve(overviewView({ window: window as OverviewView['window'] }))),
  );
  const loaded = signal(options.prefsLoaded ?? true);
  const window = signal<'30d' | '90d' | '12m'>('90d');
  const shell = {
    patientId: signal('p-marie'),
    patient: signal<ShellPatient | null>(marie),
    followedSince: signal<string | null>(null),
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
        useValue: { overviewWindow: window, loaded, status: signal('idle') },
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
  return { fixture, el, overview, shell, window, loaded, settle: () => settle(fixture) };
}

async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await tick();
  await fixture.whenStable();
  await tick();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Titre d'une section, sans son compteur collé (« Situations en cours · 1 »). */
function title(h: Element): string {
  return text(h).replace(/ · \d+$/, '');
}

/** La section dont le titre est `heading`. */
function section(el: HTMLElement, heading: string): HTMLElement {
  const found = [...el.querySelectorAll<HTMLElement>('pm-overview-section section')].find(
    (s) => title(s.querySelector('h3')!) === heading,
  );
  if (!found) throw new Error(`section introuvable : ${heading}`);
  return found;
}

function since(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('pm-overview-since section')!;
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

describe('OverviewPage (vue unifiée, UX-S6)', () => {
  it('ordre de lecture : bande « Depuis », ressentis, noté depuis, séances ; latérale dessous', async () => {
    const { el } = await render();
    const main = el.querySelector<HTMLElement>('.ov > .main')!;
    expect([...main.children].map((c) => c.tagName.toLowerCase())).toEqual([
      'pm-overview-since',
      'pm-overview-feelings',
      'pm-overview-noted',
      'pm-overview-sessions',
    ]);
    expect([...main.querySelectorAll('pm-overview-section h3')].map(title)).toEqual(MAIN);
    const side = el.querySelector<HTMLElement>('.ov > pm-overview-side')!;
    expect(side.getAttribute('role')).toBe('region');
    expect([...side.querySelectorAll('pm-overview-section h3')].map(title)).toEqual(SIDE);
    // Une seule boîte : la carte du graphe.
    expect(el.querySelectorAll('.panel')).toHaveLength(1);
    expect(
      el.querySelector('pm-overview-feelings .panel pm-overview-feelings-chart'),
    ).not.toBeNull();
  });

  it('une seule vue : ni bascule Simple / Complète, ni bloc de saisie hors séance, ni activité récente', async () => {
    const { el } = await render();
    expect(el.querySelector('pm-overview-view-toggle, pm-overview-simple')).toBeNull();
    expect([...el.querySelectorAll('button')].map((b) => text(b))).not.toContain('Simple');
    expect([...el.querySelectorAll('button')].map((b) => text(b))).not.toContain('Complète');
    expect(el.querySelector('pm-capture-block')).toBeNull();
    expect(text(el)).not.toContain('Activité récente');
    expect(text(el)).not.toContain('Faits clés');
    expect(text(el)).not.toContain('moyenne glissante');
  });

  it('chargement : chaque section garde son titre et montre un squelette', async () => {
    const { el, overview } = await render({ overview: () => never() });
    expect(overview).toHaveBeenCalledWith('p-marie', '90d');
    expect(since(el).querySelector('.state.loading, [aria-busy="true"]')).not.toBeNull();
    for (const heading of [...MAIN, ...SIDE]) {
      expect(section(el, heading).querySelector('[aria-busy="true"]')).not.toBeNull();
    }
  });

  it('vide (dossier sans séance) : « Depuis l’ouverture du dossier », chiffres à zéro, états vides', async () => {
    const { el } = await render({ overview: () => Promise.resolve(emptyOverview()) });
    expect(text(since(el).querySelector('h3'))).toBe("Depuis l'ouverture du dossier");
    expect([...since(el).querySelectorAll('.fact b')].map((b) => text(b))).toEqual(['0', '—', '0']);
    expect(text(el.querySelector('pm-overview-noted h3'))).toBe(
      "Noté depuis l'ouverture du dossier",
    );
    const empties: Record<string, string> = {
      'Comment évoluent les ressentis': 'Pas encore de ressentis sur cette période',
      "Noté depuis l'ouverture du dossier": 'Rien de noté depuis',
      'Dernières séances': 'Aucune séance',
      'Traitement en cours': 'Aucun traitement en cours',
      'Situations en cours': 'Aucune situation en cours',
      'Émotions · 90 jours': 'Aucune émotion sur la période',
      'À compléter': 'Rien à compléter',
    };
    for (const [heading, empty] of Object.entries(empties)) {
      const found = section(el, heading);
      expect(found.querySelector('[role="status"]')).not.toBeNull();
      expect(text(found)).toContain(empty);
    }
  });

  it('erreur : chaque section en erreur avec « Réessayer », qui relit la synthèse', async () => {
    let calls = 0;
    const { el, overview, settle } = await render({
      overview: () =>
        ++calls === 1
          ? Promise.reject({ status: 500, code: 'INTERNAL_ERROR' })
          : Promise.resolve(overviewView()),
    });
    expect(since(el).querySelector('[role="alert"]')).not.toBeNull();
    for (const heading of [...MAIN, ...SIDE]) {
      expect(section(el, heading).querySelector('[role="alert"]')).not.toBeNull();
    }
    button(section(el, 'Situations en cours'), 'Réessayer').click();
    await settle();
    expect(overview).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(text(section(el, 'Situations en cours'))).toContain('Surcharge au travail');
  });

  it('bande « Depuis la séance » : date de la séance, phrases du serveur, point d’attention, trois chiffres', async () => {
    const view = overviewView();
    // Séance du 21 oct. : moyenne 5,5 alors, 7 aujourd'hui → en hausse.
    view.sinceLastSession = { ...view.sinceLastSession, lastSessionAt: '2026-10-21T14:00:00Z' };
    const { el } = await render({ overview: () => Promise.resolve(view) });
    const strip = since(el);
    expect(text(strip.querySelector('h3'))).toMatch(/^Depuis la séance du 21 octobre/);
    expect(text(strip.querySelector('.brief'))).toContain('Une situation reste ouverte');
    expect([...strip.querySelectorAll('.brief b')].map((b) => text(b))).toContain('31');
    expect(text(strip.querySelector('.attention'))).toBe(
      "Point d'attention : À surveiller depuis le 3 octobre 2026 (motif : Sommeil).",
    );
    const facts = [...strip.querySelectorAll('.fact')].map((f) =>
      [...f.children].map((c) => text(c)),
    );
    expect(facts[0]).toEqual(['1', 'ressenti']);
    expect(facts[1]).toEqual(['7,0 ↑', 'intensité · 7 j', 'en hausse depuis la séance']);
    expect(facts[2]).toEqual(['2', 'brouillons']);
    expect(strip.querySelector('.fact b.trend-up')).not.toBeNull();
  });

  it('ressentis : compteur, légende par émotion, repères ; « Voir les données » déplie le tableau', async () => {
    const { el, settle } = await render();
    const feelings = section(el, 'Comment évoluent les ressentis');
    expect(text(feelings.querySelector('.count'))).toBe(
      '90 jours · 2 ressentis · chaque point est une entrée',
    );
    expect([...feelings.querySelectorAll('.legend li')].map((li) => text(li))).toEqual([
      'Anxiété 1',
      'Joie 1',
      'séance',
      'traitement',
    ]);
    const toggle = button(feelings, 'Voir les données');
    const data = feelings.querySelector<HTMLElement>('.data')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(data.hidden).toBe(true);
    toggle.click();
    await settle();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(data.hidden).toBe(false);
    expect(feelings.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(feelings.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'moyenne glissante sur 7 jours',
    );
  });

  it('« Voir les données » : rangé dans la mémoire du dossier (B2), repris au retour sur l’onglet', async () => {
    const { el, shell, settle } = await render();
    button(section(el, 'Comment évoluent les ressentis'), 'Voir les données').click();
    await settle();
    expect(shell.rememberTab).toHaveBeenCalledWith('overview', { showData: true });
    TestBed.resetTestingModule();
    const back = await render({ remembered: { showData: true } });
    const feelings = section(back.el, 'Comment évoluent les ressentis');
    expect(button(feelings, 'Masquer les données').getAttribute('aria-expanded')).toBe('true');
    expect(feelings.querySelector<HTMLElement>('.data')!.hidden).toBe(false);
  });

  it('vide : pas de « Voir les données » sans ressenti', async () => {
    const { el } = await render({ overview: () => Promise.resolve(emptyOverview()) });
    expect(text(section(el, 'Comment évoluent les ressentis'))).not.toContain('Voir les données');
  });

  it('un point du graphe ouvre le ressenti (?entry=)', async () => {
    const { fixture, settle } = await render();
    const router = TestBed.inject(Router);
    const feelings = fixture.debugElement.query(
      (d) => d.componentInstance instanceof OverviewFeelingsComponent,
    );
    (feelings.componentInstance as OverviewFeelingsComponent).pointSelected.emit('f-1');
    await settle();
    expect(router.url).toBe('/?entry=f-1');
  });

  it('noté depuis la séance : émotion et échelle à dix cases (jamais « Ressenti »), brouillon, date mono', async () => {
    const { el } = await render();
    const noted = section(el, 'Noté depuis la dernière séance');
    expect(text(noted.querySelector('.count'))).toBe('2 entrées · 1 brouillon');
    expect(link(noted, 'Tout dans la timeline').getAttribute('href')).toBe(
      '/patients/p-marie/timeline',
    );
    const [feeling, note] = [...noted.querySelectorAll<HTMLAnchorElement>('a.entry')];
    expect(text(feeling.querySelector('.name'))).toBe('Joie');
    expect(feeling.querySelectorAll('.scale i')).toHaveLength(10);
    expect(feeling.querySelectorAll('.scale i.on')).toHaveLength(4);
    expect(text(feeling.querySelector('.value'))).toBe('4/10');
    expect(text(feeling.querySelector('.text'))).toBe('Joie après la randonnée');
    expect(text(feeling.querySelector('.chip.draft'))).toBe('brouillon');
    expect(text(feeling.querySelector('.when'))).toMatch(/^7 nov\. \d\d:\d\d$/);
    expect(feeling.getAttribute('href')).toBe('/?entry=f-2');
    expect(text(noted)).not.toContain('Ressenti');
    expect(text(note.querySelector('.name'))).toBe('Note');
    expect(note.querySelector('.scale, .chip')).toBeNull();
  });

  it('noté depuis la séance : dix entrées au plus, le compteur dit toutes celles servies', async () => {
    const view = overviewView();
    view.sinceLastSession = {
      ...view.sinceLastSession,
      entries: Array.from({ length: 14 }, (_, i) => ({
        entryId: `n-${i}`,
        type: 'note' as const,
        title: `Note ${i}`,
        status: 'final' as const,
        occurredFrom: '2026-11-01T09:00:00Z',
      })),
    };
    const { el } = await render({ overview: () => Promise.resolve(view) });
    const noted = section(el, 'Noté depuis la dernière séance');
    expect(noted.querySelectorAll('a.entry')).toHaveLength(10);
    expect(text(noted.querySelector('.count'))).toBe('14 entrées · aucun brouillon');
  });

  it('dernières séances : ligne de la séance, entrées, compte rendu ; vers la timeline par séance', async () => {
    const { el } = await render();
    const sessions = section(el, 'Dernières séances');
    expect(text(sessions.querySelector('.count'))).toBe('1 sur 90 jours · 31 au total');
    expect(link(sessions, 'Toutes les séances').getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session',
    );
    const rows = [...sessions.querySelectorAll<HTMLElement>('.sess')];
    expect(rows.map((r) => text(r.querySelector('.t')))).toEqual([
      'Samedi 17 octobre · cabinet · 50 min',
      'Samedi 10 octobre · visio · 50 min',
    ]);
    expect(rows.map((r) => text(r.querySelector('.n')))).toEqual(['4 entrées', '2 entrées']);
    expect(text(rows[0].querySelector('.s'))).toBe(
      'Reprise du thème du travail. Objectif : préparer l’entretien.',
    );
    expect(text(rows[1].querySelector('.s'))).toBe('Point sur le sommeil.');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe(
      '/patients/p-marie/timeline?mode=session&focus=s-1',
    );
  });

  it('latérale : cadre du suivi, traitement, situations, émotions, à compléter, heure du calcul', async () => {
    const { el, shell, settle } = await render();
    const frame = section(el, 'Cadre du suivi');
    const lines = [...frame.querySelectorAll('.line')].map((l) =>
      [...l.children].map((c) => text(c)),
    );
    expect(lines[0]).toEqual(['Suivi', 'depuis mars 2025 · cabinet, 50 min']);
    expect(lines[1][0]).toBe('Drapeau');
    expect(lines[1][1]).toMatch(/^À surveiller depuis le 3 oct\. · Sommeil · modifier$/);
    expect(link(frame, 'modifier').getAttribute('href')).toBe('/patients/p-marie/fiche');
    // La fiche reste à un clic, drapeau ou non : dernière ligne du cadre (intégration UX-S6/S7).
    expect(lines[lines.length - 1][0]).toBe('Fiche');
    expect(link(frame, 'Modifier la fiche').getAttribute('href')).toBe('/patients/p-marie/fiche');

    // Même début de suivi que l'en-tête quand il en affiche un (followUp.since de la fiche).
    shell.followedSince.set('2026-09-01');
    await settle();
    expect([...frame.querySelectorAll('.line')][0].textContent).toContain('depuis sept. 2026');

    const medication = section(el, 'Traitement en cours');
    expect(text(medication.querySelector('.line'))).toBe(
      'Sertraline 75 mg matin · depuis le 12 sept. · Dr Lemaire',
    );

    const situations = section(el, 'Situations en cours');
    expect(text(situations.querySelector('h3'))).toBe('Situations en cours · 1');
    expect(text(situations.querySelector('.sit .t'))).toBe('Surcharge au travail');
    expect(text(situations.querySelector('.sit .r'))).toBe('depuis avr.');
    expect(link(situations, 'voir dans le graphe').getAttribute('href')).toBe(
      '/patients/p-marie/graph?root=e-sit',
    );
    expect(text(situations.querySelector('.sit .m'))).toContain('5 ressentis liés');

    const emotions = section(el, 'Émotions · 90 jours');
    const rows = [...emotions.querySelectorAll<HTMLElement>('.emorow')];
    expect(rows.map((r) => [...r.children].map((c) => text(c)))).toEqual([
      ['', 'Anxiété', '18', '+66 de plus que les 90 jours précédents', ''],
      ['', 'Joie', '2', '−22 de moins que les 90 jours précédents', ''],
    ]);
    expect(rows.map((r) => text(r.querySelector('.delta [aria-hidden="true"]')))).toEqual([
      '+6',
      '−2',
    ]);
    expect(rows[0].querySelector<HTMLElement>('.bar i')?.style.width).toBe('100%');
    expect(rows[1].querySelector<HTMLElement>('.bar i')?.style.width).toBe('11%');

    const todo = section(el, 'À compléter');
    expect(text(link(todo, '✎'))).toBe('✎ 2 brouillons à relire ouvrir');
    expect(link(todo, '✎').getAttribute('href')).toBe('/patients/p-marie/timeline?drafts=1');

    const foot = el.querySelector('pm-overview-side .foot')!;
    expect(foot.getAttribute('role')).toBe('status');
    expect(text(foot)).toMatch(/^Synthèse calculée par le serveur · mise à jour /);
  });

  it('fenêtre (préférence choisie dans l’en-tête) : la synthèse est relue avec ?window=', async () => {
    const { el, overview, window, settle } = await render();
    window.set('30d');
    await settle();
    expect(overview).toHaveBeenLastCalledWith('p-marie', '30d');
    expect(text(section(el, 'Comment évoluent les ressentis').querySelector('.count'))).toMatch(
      /^30 jours/,
    );
    expect(() => section(el, 'Émotions · 30 jours')).not.toThrow();
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
    expect(text(section(el, 'Situations en cours'))).toContain('Surcharge au travail');
    expect(section(el, 'Situations en cours').querySelector('[role="alert"]')).toBeNull();
    button(banner!, 'Réessayer').click();
    await settle();
    expect(overview).toHaveBeenCalledTimes(3);
    expect(el.querySelector('.reload-failed')).toBeNull();
  });

  it('relecture : une section vide reste vide, elle ne repasse pas au squelette', async () => {
    let calls = 0;
    const { el, shell, settle } = await render({
      overview: () => (++calls === 1 ? Promise.resolve(emptyOverview()) : never()),
    });
    shell.revision.set(1);
    await settle();
    const situations = section(el, 'Situations en cours');
    expect(situations.getAttribute('aria-busy')).toBe('true');
    expect(text(situations)).toContain('Aucune situation en cours');
    expect(situations.querySelector('.state.loading')).toBeNull();
  });

  it('préférences pas encore lues : aucune requête ; lues → une seule lecture', async () => {
    const { overview, loaded, settle } = await render({ prefsLoaded: false });
    expect(overview).not.toHaveBeenCalled();
    loaded.set(true);
    await settle();
    expect(overview).toHaveBeenCalledTimes(1);
  });
});
