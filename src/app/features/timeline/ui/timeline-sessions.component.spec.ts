import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { timelineItem } from '../data/timeline.fixtures';
import { SessionDetailState, SessionGroup } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { TimelineSessionsComponent } from './timeline-sessions.component';

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
}

async function render() {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const toggles = () => [...el.querySelectorAll<HTMLButtonElement>('button.toggle')];
  return { fixture, host: fixture.componentInstance, el, toggles };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelineSessionsComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('la plus récente dépliée à l’ouverture (détail demandé), les autres repliées avec leur compte', async () => {
    const { el, host, toggles } = await render();
    expect(host.expanded).toEqual(['s-2']);
    const [first, second, outside] = toggles();
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(text(first)).toContain('Séance du vendredi 30 octobre 2026');
    expect(text(first)).toContain('2 entrées');
    expect(second.getAttribute('aria-expanded')).toBe('false');
    expect(text(second)).toContain('1 entrée');
    expect(text(outside)).toContain('Hors séance');
    // Le panneau de la dépliée, nommé par son bouton.
    const panel = el.querySelector(`#${first.getAttribute('aria-controls')}`);
    expect(panel?.getAttribute('aria-labelledby')).toBe(first.id);
    expect(panel?.querySelectorAll('li pm-timeline-card')).toHaveLength(2);
    expect(el.querySelectorAll('[role="region"]')).toHaveLength(1);
  });

  it('détail : chargement, erreur (Réessayer), chargé (horaires, durée, modalité, compte rendu)', async () => {
    const { fixture, el, host } = await render();
    expect(el.querySelector('.summary pm-state [aria-busy="true"]')).not.toBeNull();

    host.details.set({
      's-2': { status: 'error', detail: null, problem: { status: 500, code: 'INTERNAL_ERROR' } },
    });
    await fixture.whenStable();
    const alert = el.querySelector('.summary [role="alert"]');
    expect(text(alert)).toContain('Le détail de la séance');
    alert!.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.retries).toEqual(['s-2']);

    host.details.set({
      's-2': {
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
          summary: 'Dort mieux depuis deux semaines.',
        },
      },
    });
    await fixture.whenStable();
    const facts = text(el.querySelector('.facts'));
    expect(facts).toContain('50 min');
    expect(facts).toContain('Présentiel');
    expect(facts).toMatch(/\d{2}:\d{2} – \d{2}:\d{2}/);
    expect(el.querySelector('.open-state')).toBeNull();
    expect(text(el.querySelector('.report-text'))).toBe('Dort mieux depuis deux semaines.');
    el.querySelector<HTMLButtonElement>('.open-session')!.click();
    expect(host.sessions).toEqual(['s-2']);
  });

  it('séance ouverte : « Non clôturée » en avertissement, sans compte rendu', async () => {
    const { fixture, el, host } = await render();
    host.details.set({
      's-2': {
        status: 'loaded',
        problem: null,
        detail: {
          id: 's-2',
          from: '2026-10-30T15:00:00Z',
          to: null,
          durationMin: null,
          modality: 'video',
          kind: 'intake',
          closedAt: null,
          summary: null,
        },
      },
    });
    await fixture.whenStable();
    expect(text(el.querySelector('.open-state'))).toBe('Non clôturée');
    expect(text(el.querySelector('.report-empty'))).toBe('Aucun compte rendu.');
    expect(text(el.querySelector('button.toggle'))).toContain("Séance d'accueil du");
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
});
