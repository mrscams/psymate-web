import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { timelineItem } from '../data/timeline.fixtures';
import { TimelineItem, TimelineZoom } from '../data/timeline.model';
import { SessionCardInfo, TimelineCardComponent } from './timeline-card.component';

@Component({
  imports: [MatMenuModule, TimelineCardComponent],
  template: `
    <mat-menu #menu="matMenu">
      <ng-template matMenuContent let-item="item">
        <button mat-menu-item type="button" class="probe">{{ item.id }}</button>
      </ng-template>
    </mat-menu>
    <pm-timeline-card
      [item]="item()"
      [zoom]="zoom()"
      [before]="before()"
      [saidIn]="saidIn()"
      [emotionLabel]="emotionLabel()"
      [session]="session()"
      [menu]="menu"
      (opened)="opened.push($event)"
      (linked)="linked.push($event)"
    />
  `,
})
class HostComponent {
  readonly item = signal<TimelineItem>(timelineItem());
  readonly zoom = signal<TimelineZoom>('day');
  readonly before = signal(false);
  readonly saidIn = signal<string | null>(null);
  readonly emotionLabel = signal<string | null>(null);
  readonly session = signal<SessionCardInfo | null>(null);
  readonly opened: TimelineItem[] = [];
  readonly linked: TimelineItem[] = [];
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el, card: el.querySelector('article')! };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelineCardComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('titre, date selon la précision, mention « précision : … », type par la bordure et la forme', async () => {
    const { card } = await render((host) =>
      host.item.set(
        timelineItem({
          type: 'event',
          title: 'Entretien annuel',
          occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
        }),
      ),
    );
    expect(card.classList).toContain('type-event');
    expect(card.querySelector('pm-entry-icon')).not.toBeNull();
    expect(text(card.querySelector('.title'))).toBe('Entretien annuel');
    expect(text(card.querySelector('.when'))).toBe('18 oct. 2026');
    expect(text(card.querySelector('.precision'))).toBe('précision : jour');
    expect(card.getAttribute('aria-label')).toContain('Entretien annuel');
  });

  it('période : libellé et bornes ; phase de vie : libellé', async () => {
    const { card, host, fixture } = await render((h) =>
      h.item.set(
        timelineItem({
          occurred: {
            from: '2008-09-01T00:00:00Z',
            to: '2012-07-01T00:00:00Z',
            precision: 'period',
            label: 'Études à Lille',
          },
        }),
      ),
    );
    expect(text(card.querySelector('.when'))).toContain('Études à Lille');
    expect(text(card.querySelector('.when'))).toContain('2008');
    host.item.set(timelineItem({ occurred: { precision: 'life_phase', label: 'enfance' } }));
    await fixture.whenStable();
    expect(text(card.querySelector('.when'))).toBe('enfance');
    expect(text(card.querySelector('.precision'))).toBe('précision : phase de vie');
  });

  it('brouillon, ressenti (pastille de famille, n/10), tags, liens', async () => {
    const { card } = await render((host) => {
      host.item.set(
        timelineItem({
          type: 'feeling',
          title: null,
          status: 'draft',
          emotion: { code: 'anxiety', family: 'fear' },
          intensity: 8,
          tags: ['travail', 'sommeil', 'couple', 'famille'],
          linkCount: 2,
        }),
      );
      host.emotionLabel.set('Anxiété');
    });
    expect(text(card.querySelector('.title'))).toBe('Anxiété');
    expect(text(card.querySelector('.draft'))).toBe('Brouillon');
    const dot = card.querySelector<HTMLElement>('.dot')!;
    expect(dot.classList).toContain('family-fear');
    expect(dot.style.opacity).toBe('0.8');
    expect(text(card.querySelector('.intensity'))).toBe('8/10');
    expect([...card.querySelectorAll('.tag')].map((tag) => text(tag))).toEqual([
      '#travail',
      '#sommeil',
      '#couple',
      '+1',
    ]);
    expect(text(card.querySelector('.links'))).toBe('2 liens');
  });

  it('date exacte : pas de mention « précision : exacte » (UX-B2)', async () => {
    const { card } = await render();
    expect(text(card.querySelector('.when'))).toContain('24 oct. 2026');
    expect(card.querySelector('.precision')).toBeNull();
  });

  it('sans titre : titre de repli partagé (UX-A5) ; ressenti : nom de l’émotion, « n/10 » à part', async () => {
    const { card, host, fixture } = await render((h) =>
      h.item.set(
        timelineItem({
          title: null,
          occurred: { from: '2026-10-24T00:00:00Z', to: null, precision: 'day', label: null },
        }),
      ),
    );
    expect(text(card.querySelector('.title'))).toMatch(/^Note · 24 oct\.( 2026)?$/);
    host.item.set(
      timelineItem({
        type: 'feeling',
        title: null,
        emotion: { code: 'anxiety', family: 'fear' },
        intensity: 6,
      }),
    );
    host.emotionLabel.set('Anxiété');
    await fixture.whenStable();
    expect(text(card.querySelector('.title'))).toBe('Anxiété');
    expect(text(card.querySelector('.intensity'))).toBe('6/10');
    expect(card.querySelector<HTMLElement>('.gauge-fill')!.style.width).toBe('60%');
    expect(card.getAttribute('aria-label')).toContain('6/10');
  });

  it('séance : « Séance · 50 min · cabinet », nombre d’entrées, « non clôturée » en avertissement', async () => {
    const { card, host, fixture } = await render((h) => {
      h.item.set(
        timelineItem({
          id: 's-1',
          type: 'session',
          title: null,
          sessionId: null,
          occurred: {
            from: '2026-10-17T16:00:00Z',
            to: '2026-10-17T16:50:00Z',
            precision: 'exact',
            label: null,
          },
        }),
      );
    });
    // Sans détail : la durée d'après les bornes, rien d'autre.
    expect(text(card.querySelector('.title'))).toBe('Séance · 50 min');
    expect(card.querySelector('.session-count')).toBeNull();
    expect(card.querySelector('.warn')).toBeNull();
    host.session.set({
      kind: 'session',
      durationMin: 45,
      modality: 'in_person',
      closed: false,
      entries: 4,
    });
    await fixture.whenStable();
    expect(text(card.querySelector('.title'))).toBe('Séance · 45 min · cabinet');
    expect(text(card.querySelector('.session-count'))).toBe('4 entrées');
    expect(text(card.querySelector('.warn'))).toBe('non clôturée');
    expect(card.getAttribute('aria-label')).toContain('non clôturée');
    host.session.set({
      kind: 'intake',
      durationMin: null,
      modality: 'video',
      closed: true,
      entries: 1,
    });
    await fixture.whenStable();
    expect(text(card.querySelector('.title'))).toBe("Séance d'accueil · 50 min · visio");
    expect(text(card.querySelector('.session-count'))).toBe('1 entrée');
    expect(card.querySelector('.warn')).toBeNull();
  });

  it('situation en cours : puce « en cours »', async () => {
    const { card } = await render((h) =>
      h.item.set(
        timelineItem({
          type: 'situation',
          title: 'Surcharge au travail',
          ongoing: true,
          occurred: { from: '2026-09-03T00:00:00Z', to: null, precision: 'day', label: null },
        }),
      ),
    );
    expect(text(card.querySelector('.ongoing'))).toBe('en cours');
    expect(card.querySelector('.precision')?.classList.contains('loose')).toBe(false);
  });

  it('pastille « dit en séance du … » seulement quand elle est donnée', async () => {
    const { card, host, fixture } = await render();
    expect(card.querySelector('.said')).toBeNull();
    host.saidIn.set('2026-10-17T16:00:00Z');
    await fixture.whenStable();
    expect(text(card.querySelector('.said'))).toBe('dit en séance du 17 oct. 2026');
  });

  it('zone « Avant le suivi » : carte réduite, sans détails ; mois : sans mention de précision', async () => {
    const { card, host, fixture } = await render((h) => {
      h.before.set(true);
      h.item.set(timelineItem({ tags: ['travail'] }));
    });
    expect(card.classList).toContain('before');
    expect(card.querySelector('.details')).toBeNull();
    host.before.set(false);
    host.zoom.set('month');
    await fixture.whenStable();
    expect(card.classList).toContain('compact');
    expect(card.querySelector('.precision')).toBeNull();
  });

  it('provenance : place gardée, jamais dessinée', async () => {
    const { card } = await render();
    const slot = card.querySelector<HTMLElement>('.author-slot')!;
    expect(slot.hidden).toBe(true);
    expect(slot.dataset['authorType']).toBe('practitioner');
  });

  it('Entrée ou clic : ouvre ; le bouton ⋯ n’ouvre pas l’entrée', async () => {
    const { card, host } = await render();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    card.click();
    expect(host.opened.map((item) => item.id)).toEqual(['e-1', 'e-1']);
    card.querySelector<HTMLButtonElement>('button.more')!.click();
    expect(host.opened).toHaveLength(2);
  });

  it('Maj+F10 et clic droit : le menu contextuel s’ouvre sur l’entrée', async () => {
    const { card, fixture } = await render();
    const more = card.querySelector<HTMLButtonElement>('button.more')!;
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    card.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(text(document.querySelector('.probe'))).toBe('e-1');
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('L sur la carte : « lier » émis, la touche est consommée (pas le raccourci global)', async () => {
    const { card, host } = await render();
    const press = (target: Element, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', {
        key: 'l',
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    };
    const event = press(card);
    expect(event.defaultPrevented).toBe(true);
    expect(host.linked.map((item) => item.id)).toEqual(['e-1']);
    expect(card.getAttribute('aria-keyshortcuts')).toContain('L');
    // Ctrl+L, ou L sur le bouton ⋯ : rien.
    press(card, { ctrlKey: true });
    press(card.querySelector('button.more')!);
    expect(host.linked).toHaveLength(1);
  });
});
