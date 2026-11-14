import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { timelineItem } from '../data/timeline.fixtures';
import { TimelineItem } from '../data/timeline.model';
import { TimelineCardComponent } from './timeline-card.component';

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
      [compact]="compact()"
      [before]="before()"
      [saidIn]="saidIn()"
      [emotionLabel]="emotionLabel()"
      [fullDate]="fullDate()"
      [menu]="menu"
      (opened)="opened.push($event)"
      (edited)="edited.push($event)"
      (linked)="linked.push($event)"
    />
  `,
})
class HostComponent {
  readonly item = signal<TimelineItem>(timelineItem());
  readonly compact = signal(false);
  readonly before = signal(false);
  readonly saidIn = signal<string | null>(null);
  readonly emotionLabel = signal<string | null>(null);
  readonly fullDate = signal(false);
  readonly opened: TimelineItem[] = [];
  readonly edited: TimelineItem[] = [];
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

  it('ligne d’une entrée : titre, heure en mono, marqueur du type sur l’axe, nom accessible complet', async () => {
    const { card } = await render((host) =>
      host.item.set(
        timelineItem({
          type: 'note',
          title: 'Point sur le sommeil',
          occurred: { from: '2026-10-24T07:40:00Z', to: null, precision: 'exact', label: null },
        }),
      ),
    );
    expect(card.classList).toContain('type-note');
    expect(card.querySelector('.marker pm-entry-icon')).not.toBeNull();
    expect(text(card.querySelector('.title'))).toBe('Point sur le sommeil');
    // L'heure seule (le jour est écrit par l'ancre de la page), au format de la langue.
    expect(text(card.querySelector('.tm'))).toMatch(/^\d{2}:\d{2}$/);
    expect(card.getAttribute('aria-label')).toMatch(/^Note, Point sur le sommeil, 24 oct\. 2026/);
    // Pas d'extrait : la ligne n'a pas de seconde ligne sans tag, lien ni pastille.
    expect(card.querySelector('.txt')).toBeNull();
    expect(card.classList).not.toContain('two-lines');
  });

  it('précision moins fine que l’heure : la précision à la place de l’heure (« jour », « année »)', async () => {
    const { card, host, fixture } = await render((h) =>
      h.item.set(
        timelineItem({
          type: 'event',
          title: 'Entretien annuel',
          occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
        }),
      ),
    );
    expect(text(card.querySelector('.tm'))).toBe('jour');
    expect(card.getAttribute('aria-label')).toContain('18 oct. 2026');
    host.item.set(
      timelineItem({
        occurred: { from: '2014-01-01T00:00:00Z', to: null, precision: 'year', label: null },
      }),
    );
    await fixture.whenStable();
    expect(text(card.querySelector('.tm'))).toBe('année');
  });

  it('ressenti : nommé par son émotion, échelle à dix cases et « n/10 », jamais « Ressenti » seul', async () => {
    const { card } = await render((host) => {
      host.item.set(
        timelineItem({
          type: 'feeling',
          title: null,
          emotion: { code: 'anxiety', family: 'fear' },
          intensity: 7,
        }),
      );
      host.emotionLabel.set('Anxiété');
    });
    expect(text(card.querySelector('.title'))).toBe('Anxiété');
    const cells = card.querySelectorAll('.scale i');
    expect(cells).toHaveLength(10);
    expect(card.querySelectorAll('.scale i.on')).toHaveLength(7);
    expect(text(card.querySelector('.score'))).toBe('7/10');
    expect(card.getAttribute('aria-label')).toContain('7/10');
  });

  it('ressenti titré : l’émotion passe en seconde ligne ; intensité 0 : dix cases vides', async () => {
    const { card, host, fixture } = await render((h) => {
      h.item.set(
        timelineItem({
          type: 'feeling',
          title: 'Réveil à 4 h',
          emotion: { code: 'anxiety', family: 'fear' },
          intensity: 0,
        }),
      );
      h.emotionLabel.set('Anxiété');
    });
    expect(text(card.querySelector('.title'))).toBe('Réveil à 4 h');
    expect(text(card.querySelector('.txt .emotion'))).toBe('Anxiété');
    expect(card.querySelectorAll('.scale i.on')).toHaveLength(0);
    expect(text(card.querySelector('.score'))).toBe('0/10');
    host.item.set(timelineItem({ title: null }));
    await fixture.whenStable();
    expect(card.querySelector('.scale')).toBeNull();
  });

  it('sans titre : titre de repli partagé (UX-A5)', async () => {
    const { card } = await render((host) =>
      host.item.set(
        timelineItem({
          title: null,
          occurred: { from: '2026-10-10T12:00:00Z', to: null, precision: 'exact', label: null },
        }),
      ),
    );
    expect(text(card.querySelector('.title'))).toBe('Note · 10 oct.');
  });

  it('brouillon, situation en cours, tags (+n), liens en nombre, pastille « dit en séance du … »', async () => {
    const { card, host, fixture } = await render((h) =>
      h.item.set(
        timelineItem({
          type: 'situation',
          status: 'draft',
          ongoing: true,
          tags: ['sommeil', 'travail', 'famille', 'nuit'],
          linkCount: 2,
        }),
      ),
    );
    expect(text(card.querySelector('.chip.draft'))).toBe('brouillon');
    expect(text(card.querySelector('.chip.ongoing'))).toBe('en cours');
    expect([...card.querySelectorAll('.tag')].map(text)).toEqual([
      '#sommeil',
      '#travail',
      '#famille',
      '+1',
    ]);
    expect(text(card.querySelector('.links'))).toBe('2 liens');
    expect(card.classList).toContain('two-lines');
    expect(card.querySelector('.said')).toBeNull();
    host.saidIn.set('2026-10-22T09:00:00Z');
    await fixture.whenStable();
    expect(text(card.querySelector('.said'))).toBe('dit en séance du 22 oct. 2026');
    expect(card.getAttribute('aria-label')).toContain('brouillon');
  });

  it('ligne réduite (zoom « Mois », « Avant le suivi ») : sans seconde ligne', async () => {
    const { card, host, fixture } = await render((h) => {
      h.item.set(timelineItem({ tags: ['sommeil'] }));
      h.compact.set(true);
    });
    expect(card.classList).toContain('compact');
    expect(card.querySelector('.txt')).toBeNull();
    host.compact.set(false);
    host.before.set(true);
    await fixture.whenStable();
    expect(card.classList).toContain('before');
    expect(card.querySelector('.txt')).toBeNull();
  });

  it('mode par séance : la date complète à la place de l’heure', async () => {
    const { card } = await render((host) => {
      host.item.set(
        timelineItem({
          occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
        }),
      );
      host.fullDate.set(true);
    });
    expect(text(card.querySelector('.tm'))).toBe('18 oct. 2026');
  });

  it('provenance : place gardée, jamais dessinée', async () => {
    const { card } = await render();
    const slot = card.querySelector<HTMLElement>('.author-slot')!;
    expect(slot.hidden).toBe(true);
    expect(slot.dataset['authorType']).toBe('practitioner');
  });

  it('Entrée ou clic : ouvre ; Corriger et Lier au survol émettent leur action sans ouvrir', async () => {
    const { card, host } = await render();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    card.click();
    expect(host.opened.map((item) => item.id)).toEqual(['e-1', 'e-1']);
    const [edit, link, more] = [...card.querySelectorAll<HTMLButtonElement>('.acts button')];
    expect(edit.getAttribute('aria-label')).toBe('Corriger');
    expect(link.getAttribute('aria-label')).toBe('Lier (L)');
    edit.click();
    link.click();
    more.click();
    expect(host.edited.map((item) => item.id)).toEqual(['e-1']);
    expect(host.linked.map((item) => item.id)).toEqual(['e-1']);
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

  it('L sur la ligne : « lier » émis, la touche est consommée (pas le raccourci global)', async () => {
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
