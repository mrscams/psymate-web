import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { timelineItem } from '../data/timeline.fixtures';
import { SessionDetail } from '../data/timeline-sessions.model';
import { TimelineItem } from '../data/timeline.model';
import { TimelineSessionDividerComponent } from './timeline-session-divider.component';

const session = timelineItem({
  id: 's-1',
  type: 'session',
  title: null,
  sessionId: null,
  occurred: {
    from: '2026-11-05T09:00:00Z',
    to: '2026-11-05T09:50:00Z',
    precision: 'exact',
    label: null,
  },
});

const detail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 's-1',
  from: '2026-11-05T09:00:00Z',
  to: '2026-11-05T09:50:00Z',
  durationMin: 50,
  modality: 'in_person',
  kind: 'session',
  closedAt: '2026-11-05T09:50:00Z',
  summary: 'Reprise du thème du sommeil.\nObjectif : agenda du sommeil.',
  ...overrides,
});

@Component({
  imports: [MatMenuModule, TimelineSessionDividerComponent],
  template: `
    <mat-menu #menu="matMenu">
      <ng-template matMenuContent let-item="item">
        <button mat-menu-item type="button" class="probe">{{ item.id }}</button>
      </ng-template>
    </mat-menu>
    <pm-timeline-session-divider
      [item]="item()"
      sessionId="s-1"
      [detail]="detail()"
      [entries]="entries()"
      [compact]="compact()"
      [toggle]="toggle()"
      [expanded]="expanded()"
      [menu]="toggle() ? null : menu"
      (opened)="opened.push($event)"
      (linked)="linked.push($event)"
      (toggled)="toggled = toggled + 1"
      (closeRequested)="closes.push($event)"
    />
  `,
})
class HostComponent {
  readonly item = signal<TimelineItem | null>(session);
  readonly detail = signal<SessionDetail | null>(detail());
  readonly entries = signal<number | null>(6);
  readonly compact = signal(false);
  readonly toggle = signal(false);
  readonly expanded = signal(false);
  readonly opened: string[] = [];
  readonly linked: TimelineItem[] = [];
  readonly closes: string[] = [];
  toggled = 0;
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
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

describe('TimelineSessionDividerComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('séparateur : « Séance · cabinet · 50 min », « 6 entrées · compte rendu ↓ », première ligne du compte rendu', async () => {
    const { el } = await render();
    const head = el.querySelector('article.session-head')!;
    expect(text(head.querySelector('.label'))).toBe('Séance · cabinet · 50 min');
    expect(words(head.querySelector('.sum'))).toBe('6 entrées · compte rendu ↓');
    expect(text(el.querySelector('.summary'))).toBe('Reprise du thème du sommeil.');
    expect(head.getAttribute('data-entry-id')).toBe('s-1');
    expect(head.getAttribute('aria-label')).toContain('Séance · cabinet · 50 min');
  });

  it('sans compte rendu ni compte sûr : rien d’inventé ; zoom « Mois » : pas de compte rendu', async () => {
    const { el, host, fixture } = await render((h) => {
      h.detail.set(detail({ summary: null }));
      h.entries.set(null);
    });
    expect(text(el.querySelector('.sum'))).toBe('');
    expect(el.querySelector('.summary')).toBeNull();
    host.detail.set(detail());
    host.compact.set(true);
    await fixture.whenStable();
    expect(el.querySelector('.summary')).toBeNull();
  });

  it('séance ouverte : « en cours depuis n min », « n entrées notées · clôturer »', async () => {
    const started = new Date(Date.now() - 12 * 60_000).toISOString();
    const { el, host } = await render((h) => {
      h.item.set({ ...session, occurred: { ...session.occurred, from: started, to: null } });
      h.detail.set(
        detail({ closedAt: null, to: null, durationMin: null, summary: null, from: started }),
      );
      h.entries.set(2);
    });
    expect(text(el.querySelector('.label'))).toBe('Séance · cabinet · en cours depuis 12 min');
    expect(words(el.querySelector('.sum'))).toBe('2 entrées notées · clôturer');
    const close = el.querySelector<HTMLButtonElement>('button.close')!;
    expect(close.getAttribute('aria-label')).toBe('Clôturer la séance (onglet Séance)');
    close.click();
    expect(host.closes).toEqual(['s-1']);
    expect(host.opened).toEqual([]);
  });

  it('séance ouverte depuis plus de 3 h : « non clôturée », sans chronomètre ; « clôturer » reste', async () => {
    const started = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { el } = await render((h) => {
      h.item.set({ ...session, occurred: { ...session.occurred, from: started, to: null } });
      h.detail.set(
        detail({ closedAt: null, to: null, durationMin: null, summary: null, from: started }),
      );
      h.entries.set(0);
    });
    expect(text(el.querySelector('.label'))).toBe('Séance · cabinet · non clôturée');
    expect(words(el.querySelector('.sum'))).toBe('aucune entrée · clôturer');
  });

  it('séance d’accueil (jamais clôturée par l’API) : ni « non clôturée », ni « clôturer »', async () => {
    const started = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    const { el } = await render((h) => {
      h.item.set({
        ...session,
        title: null,
        occurred: { ...session.occurred, from: started, to: null },
      });
      h.detail.set(
        detail({
          kind: 'intake',
          closedAt: null,
          to: null,
          durationMin: null,
          summary: null,
          from: started,
        }),
      );
      h.entries.set(0);
    });
    expect(text(el.querySelector('.label'))).not.toContain('non clôturée');
    expect(text(el.querySelector('.label'))).not.toContain('en cours');
    expect(el.querySelector('button.close')).toBeNull();
  });

  it('flux : Entrée ou clic ouvre la séance, L lie, Maj+F10 ouvre le menu des lignes', async () => {
    const { el, host, fixture } = await render();
    const head = el.querySelector<HTMLElement>('article.session-head')!;
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    head.click();
    expect(host.opened).toEqual(['s-1', 's-1']);
    const l = new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true });
    head.dispatchEvent(l);
    expect(l.defaultPrevented).toBe(true);
    expect(host.linked.map((item) => item.id)).toEqual(['s-1']);
    head.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(text(document.querySelector('.probe'))).toBe('s-1');
  });

  it('mode par séance : bouton aria-expanded qui déplie, « Ouvrir » à droite', async () => {
    const { el, host, fixture } = await render((h) => h.toggle.set(true));
    const button = el.querySelector<HTMLButtonElement>('button.head')!;
    expect(el.querySelector('article')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    expect(host.toggled).toBe(1);
    host.expanded.set(true);
    await fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    el.querySelector<HTMLButtonElement>('button.open-button')!.click();
    expect(host.opened).toEqual(['s-1']);
  });
});
