import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TimelineFacets } from '../data/timeline.model';
import { TimelineSideComponent } from './timeline-side.component';

@Component({
  imports: [TimelineSideComponent],
  template: `<pm-timeline-side
    [status]="status()"
    [facets]="facets()"
    span="90 jours"
    [emotionLabels]="{ anxiety: 'Anxiété', joy: 'Joie', sadness: 'Tristesse' }"
    [emotionFamilies]="{ anxiety: 'fear', joy: 'joy', sadness: 'sadness' }"
    [selected]="selected()"
    (emotionToggled)="toggled.push($event)"
  />`,
})
class HostComponent {
  readonly status = signal<'loading' | 'loaded' | 'error'>('loaded');
  readonly facets = signal<TimelineFacets>({
    types: { feeling: 9, note: 1, event: 1, situation: 1, medication: 1, session: 2 },
    emotions: { anxiety: 4, sadness: 2, joy: 1 },
    tags: {},
  });
  readonly selected = signal<string[]>([]);
  readonly toggled: string[] = [];
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

describe('TimelineSideComponent', () => {
  it('« Sur la période · 90 jours », « 13 entrées · 2 séances », compte par type des facettes', async () => {
    const { el } = await render();
    const [period] = [...el.querySelectorAll('section')];
    expect(text(period.querySelector('.lbl'))).toBe('Sur la période · 90 jours');
    expect(text(period.querySelector('.headline'))).toBe('13 entrées · 2 séances');
    expect([...period.querySelectorAll('.mini-list li')].map(words)).toEqual([
      'Ressentis 9',
      'Notes 1',
      'Événements 1',
      'Situations 1',
      'Médicaments 1',
    ]);
  });

  it('émotions notées : les plus notées d’abord, pastille de famille, un clic filtre (côté serveur)', async () => {
    const { el, host, fixture } = await render();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button.emotion')];
    expect(buttons.map(words)).toEqual(['Anxiété 4', 'Tristesse 2', 'Joie 1']);
    expect(buttons[0].querySelector('.emo.family-fear')).not.toBeNull();
    expect(text(el)).toContain('Cliquer une émotion filtre la timeline.');
    buttons[1].click();
    expect(host.toggled).toEqual(['sadness']);
    host.selected.set(['sadness']);
    await fixture.whenStable();
    expect(el.querySelector('button[data-emotion="sadness"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('raccourcis : ↑ ↓ parcourir · ↵ ouvrir · L lier · M mode · + − zoom · ? tout', async () => {
    const { el } = await render();
    const keys = [...el.querySelectorAll('section')].at(-1)!;
    expect(words(keys)).toBe(
      'Raccourcis ↑ ↓ parcourir · ↵ ouvrir · L lier · M mode · + − zoom · ? tout',
    );
  });

  it('trois états : squelette pendant la lecture, erreur sans chiffre faux, résumé une fois lu', async () => {
    const { el, host, fixture } = await render((h) => h.status.set('loading'));
    expect(el.querySelector('pm-state')).not.toBeNull();
    expect(el.querySelector('.headline')).toBeNull();
    host.status.set('error');
    await fixture.whenStable();
    expect(text(el)).toContain('Résumé de la période indisponible.');
    expect(el.querySelector('.headline')).toBeNull();
    host.status.set('loaded');
    await fixture.whenStable();
    expect(el.querySelector('.headline')).not.toBeNull();
  });

  it('période sans émotion : pas de panneau « Émotions notées »', async () => {
    const { el } = await render((h) =>
      h.facets.set({ types: { note: 1 }, emotions: {}, tags: {} }),
    );
    expect(text(el)).not.toContain('Émotions notées');
    expect(text(el.querySelector('.headline'))).toBe('1 entrée · aucune séance');
  });
});
