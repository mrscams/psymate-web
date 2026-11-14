import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { timelineItem } from '../data/timeline.fixtures';
import { SessionDetailState, SessionGroup } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { SESSIONS_PAGE, TimelineSessionsComponent } from './timeline-sessions.component';

const at = (iso: string) => ({ from: iso, to: null, precision: 'exact' as const, label: null });

const groups: SessionGroup[] = [
  {
    id: 's-2',
    session: null,
    from: '2026-10-30T15:00:00Z',
    entries: [
      timelineItem({ id: 'a', title: 'Point sur le sommeil', sessionId: 's-2' }),
      timelineItem({
        id: 'b',
        type: 'feeling',
        title: null,
        emotion: { code: 'anxiety', family: 'fear' },
        intensity: 7,
        sessionId: 's-2',
        occurred: at('2026-10-29T08:00:00Z'),
      }),
    ],
  },
  {
    id: 's-1',
    session: null,
    from: '2026-09-01T15:00:00Z',
    entries: [timelineItem({ id: 'c', title: 'Entretien annuel', sessionId: 's-1' })],
  },
  {
    id: null,
    session: null,
    from: null,
    entries: [timelineItem({ id: 'o', title: 'Orpheline', sessionId: 's-privee' })],
  },
];

@Component({
  imports: [MatMenuModule, TimelineSessionsComponent],
  template: `
    <mat-menu #menu="matMenu" />
    <pm-timeline-sessions
      [groups]="groups()"
      [details]="details()"
      [emotionLabels]="{ anxiety: 'Anxiété' }"
      [menu]="menu"
      (expanded)="expanded.push($event)"
      (opened)="opened.push($event)"
      (openSession)="sessions.push($event)"
      (retryDetail)="retries.push($event)"
      (closeSession)="closes = closes + 1"
    />
  `,
})
class HostComponent {
  readonly groups = signal<SessionGroup[]>(groups);
  readonly details = signal<Record<string, SessionDetailState>>({});
  readonly expanded: string[] = [];
  readonly opened: TimelineItem[] = [];
  readonly sessions: string[] = [];
  readonly retries: string[] = [];
  closes = 0;
}

async function render() {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const toggles = () => [
    ...el.querySelectorAll<HTMLButtonElement>('button.head, button.outside-head'),
  ];
  return { fixture, host: fixture.componentInstance, el, toggles };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Texte des nœuds feuilles, séparés par une espace (les espaces entre éléments ne sont pas rendus). */
function words(el: Element | null | undefined): string {
  if (!el) return '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (value) parts.push(value);
  }
  return parts.join(' ');
}

const loaded = (overrides: Record<string, unknown> = {}): SessionDetailState => ({
  status: 'loaded',
  problem: null,
  detail: {
    id: 's-2',
    from: '2026-10-30T15:00:00Z',
    to: '2026-10-30T15:50:00Z',
    durationMin: 50,
    modality: 'in_person',
    kind: 'session',
    closedAt: '2026-10-30T15:50:00Z',
    summary: 'Dort mieux depuis deux semaines.\nReprise du sport.',
    ...overrides,
  },
});

describe('TimelineSessionsComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('même grammaire que le flux : date à gauche, séparateur teinté, la plus récente dépliée', async () => {
    const { el, host, toggles } = await render();
    expect(host.expanded).toEqual(['s-2']);
    const [first, second, outside] = toggles();
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(text(first.closest('.session-head'))).toContain('2 entrées');
    expect(second.getAttribute('aria-expanded')).toBe('false');
    expect(text(second.closest('.session-head'))).toContain('1 entrée');
    expect(text(outside)).toContain('Hors séance');
    // La date de la séance, écrite une fois à gauche de l'axe.
    expect(text(el.querySelector('.session .date b'))).toBe('Vendredi 30');
    expect(text(el.querySelector('.session .date span'))).toBe('séance');
    // Le panneau de la dépliée : ses entrées sur l'axe, date complète.
    const panel = el.querySelector(`#${first.getAttribute('aria-controls')}`);
    expect(panel?.getAttribute('role')).toBe('region');
    expect(panel?.querySelectorAll('li pm-timeline-card')).toHaveLength(2);
    expect(el.querySelectorAll('[role="region"]')).toHaveLength(1);
    // Plus de colonne « Compte rendu » par séance (proposition 03).
    expect(el.querySelector('.report')).toBeNull();
  });

  it('détail : chargement, erreur (Réessayer), chargé (modalité, durée, première ligne du compte rendu)', async () => {
    const { fixture, el, host } = await render();
    expect(el.querySelector('.panel pm-state [aria-busy="true"]')).not.toBeNull();

    host.details.set({
      's-2': { status: 'error', detail: null, problem: { status: 500, code: 'INTERNAL_ERROR' } },
    });
    await fixture.whenStable();
    const alert = el.querySelector('.panel [role="alert"]');
    expect(text(alert)).toContain('Le détail de la séance');
    alert!.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.retries).toEqual(['s-2']);

    host.details.set({ 's-2': loaded() });
    await fixture.whenStable();
    const head = el.querySelector('.session-head')!;
    expect(text(head.querySelector('.label'))).toBe('Séance · cabinet · 50 min');
    expect(words(head.querySelector('.sum'))).toContain('2 entrées · compte rendu ↓');
    expect(text(el.querySelector('pm-timeline-session-divider .summary'))).toBe(
      'Dort mieux depuis deux semaines.',
    );
    head.querySelector<HTMLButtonElement>('button.open-button')!.click();
    expect(host.sessions).toEqual(['s-2']);
  });

  it('séance ouverte depuis des jours : « non clôturée », « clôturer » vers l’onglet Séance', async () => {
    const { fixture, el, host } = await render();
    host.details.set({
      's-2': loaded({
        to: null,
        durationMin: null,
        modality: 'video',
        kind: 'intake',
        closedAt: null,
        summary: null,
      }),
    });
    await fixture.whenStable();
    // Ouverte depuis le 30 octobre : au-delà de 3 h, plus de chronomètre (seuil de la barre de séance).
    expect(text(el.querySelector('.session-head .label'))).toBe(
      "Séance d'accueil · visio · non clôturée",
    );
    el.querySelector<HTMLButtonElement>('.session-head button.close')!.click();
    expect(host.closes).toBe(1);
  });

  it('déplier une autre séance la demande ; replier la ferme ; clic sur une entrée l’ouvre', async () => {
    const { fixture, el, host, toggles } = await render();
    toggles()[1].click();
    await fixture.whenStable();
    expect(host.expanded).toEqual(['s-2', 's-1']);
    expect(toggles()[1].getAttribute('aria-expanded')).toBe('true');
    toggles()[0].click();
    await fixture.whenStable();
    expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
    el.querySelector<HTMLElement>('article[data-entry-id="c"]')!.click();
    expect(host.opened.map((item) => item.id)).toEqual(['c']);
    // Hors séance : dépliable, avec son explication, sans détail demandé.
    toggles()[2].click();
    await fixture.whenStable();
    expect(text(el.querySelector('.outside-note'))).toContain('séance privée');
    expect(host.expanded).toEqual(['s-2', 's-1']);
  });

  it('beaucoup de séances : les plus récentes d’abord, « Afficher les n séances plus anciennes »', async () => {
    const many: SessionGroup[] = Array.from({ length: SESSIONS_PAGE + 5 }, (_, i) => ({
      id: `s-${i}`,
      session: timelineItem({
        id: `s-${i}`,
        type: 'session',
        title: null,
        sessionId: null,
        occurred: {
          from: new Date(Date.UTC(2026, 9, 30 - i, 15)).toISOString(),
          to: new Date(Date.UTC(2026, 9, 30 - i, 15, 45)).toISOString(),
          precision: 'exact',
          label: null,
        },
      }),
      from: new Date(Date.UTC(2026, 9, 30 - i, 15)).toISOString(),
      entries: [],
    }));
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.groups.set(many);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('button.head')).toHaveLength(SESSIONS_PAGE);
    // Durée d'après les bornes de la séance, avant tout détail.
    expect(text(el.querySelectorAll('.session-head .label')[1])).toBe('Séance · 45 min');
    const more = el.querySelector<HTMLButtonElement>('button.show-more')!;
    expect(text(more)).toBe('Afficher les 5 séances plus anciennes');
    more.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('button.head')).toHaveLength(SESSIONS_PAGE + 5);
    expect(el.querySelector('button.show-more')).toBeNull();
  });
});
