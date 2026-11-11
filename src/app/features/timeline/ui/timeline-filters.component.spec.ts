import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NO_FILTERS, TimelineFilters } from '../data/timeline-filters.model';
import { TimelineFacets } from '../data/timeline.model';
import { RovingToolbarDirective } from './roving-toolbar.directive';
import { TimelineFiltersComponent } from './timeline-filters.component';

@Component({
  imports: [RovingToolbarDirective, TimelineFiltersComponent],
  template: `
    <div role="toolbar" aria-label="Barre" pmRovingToolbar>
      <pm-timeline-filters
        [filters]="filters()"
        [facets]="facets()"
        [counted]="counted()"
        [emotionLabels]="{ anxiety: 'Anxiété', joy: 'Joie' }"
        [emotionFamilies]="{ anxiety: 'fear', joy: 'joy' }"
        [medicationVisible]="medicationVisible()"
        (filtersChange)="changes.push($event); filters.set($event)"
      />
    </div>
  `,
})
class HostComponent {
  readonly filters = signal<TimelineFilters>(NO_FILTERS);
  readonly facets = signal<TimelineFacets>({
    types: { feeling: 3, note: 12, session: 2 },
    emotions: { joy: 1, anxiety: 3 },
    tags: { sommeil: 4 },
  });
  readonly medicationVisible = signal(true);
  readonly counted = signal(true);
  readonly changes: TimelineFilters[] = [];
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const group = (name: string, root: ParentNode = el) =>
    root.querySelector(`[role="group"][aria-label="${name}"]`);
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(name))!;
  /** Ouvre le menu « Filtres (n) » ; ses éléments sont rendus dans l'overlay CDK. */
  const openMenu = async () => {
    button('Filtres').click();
    await fixture.whenStable();
    return document.querySelector<HTMLElement>('.mat-mdc-menu-panel')!;
  };
  return { fixture, host: fixture.componentInstance, el, group, button, openMenu };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelineFiltersComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('sans lecture réussie (chargement, erreur) : puces sans compteur, pas de « 0 »', async () => {
    const { el, group } = await render((host) => host.counted.set(false));
    expect(el.querySelector('.count')).toBeNull();
    const types = [...group('Types')!.querySelectorAll('button')].map(text);
    expect(types).toContain('Note');
    expect(types).toContain('Événement');
  });

  it('première rangée : « Types F », Tous (total) + un par type, compteurs des facettes, aria-pressed', async () => {
    const { el, group, button } = await render();
    const label = el.querySelector('.row-label')!;
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(text(label.querySelector('span'))).toBe('Types');
    expect(text(label.querySelector('kbd'))).toBe('F');
    const types = [...group('Types')!.querySelectorAll('button')].map(text);
    expect(types).toEqual([
      'Tous 17',
      'Note 12',
      'Événement 0',
      'Situation 0',
      'Ressenti 3',
      'Séance 2',
      'Médicament 0',
    ]);
    expect(button('Tous').getAttribute('aria-pressed')).toBe('true');
    expect(button('Note').getAttribute('aria-pressed')).toBe('false');
    // Émotions et tags non actifs : derrière « Filtres », pas en puces.
    expect(group('Émotions')).toBeNull();
    expect(group('Filtres actifs')).toBeNull();
    expect(text(button('Filtres'))).toBe('Filtres');
  });

  it('puce de type : bascule, « Tous » réinitialise', async () => {
    const { fixture, host, button } = await render();
    button('Ressenti').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.types).toEqual(['feeling']);
    expect(button('Ressenti').getAttribute('aria-pressed')).toBe('true');
    expect(button('Tous').getAttribute('aria-pressed')).toBe('false');
    button('Tous').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.types).toEqual([]);
  });

  it('menu « Filtres » : émotions (les plus fréquentes d’abord, pastille de famille) et tags, cases cochables', async () => {
    const { fixture, host, group, openMenu } = await render();
    const panel = await openMenu();
    const emotions = [...group('Émotions', panel)!.querySelectorAll('[role="menuitemcheckbox"]')];
    expect(emotions.map(text)).toEqual(['Anxiété 3', 'Joie 1']);
    expect(emotions[0].getAttribute('aria-checked')).toBe('false');
    expect(emotions[0].querySelector('.dot')?.classList).toContain('family-fear');
    const tags = [...group('Tags', panel)!.querySelectorAll('[role="menuitemcheckbox"]')];
    expect(tags.map(text)).toEqual(['#sommeil 4']);
    (emotions[0] as HTMLElement).click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.emotions).toEqual(['anxiety']);
  });

  it('émotion et tag actifs : puces « Filtres actifs » (un clic retire), « Filtres (2) », choisie gardée à zéro', async () => {
    const { fixture, host, group, button, openMenu } = await render((h) =>
      h.filters.set({ ...NO_FILTERS, emotions: ['anxiety', 'anger'], tags: ['sommeil'] }),
    );
    host.facets.set({ types: { feeling: 3 }, emotions: { anxiety: 3 }, tags: { sommeil: 2 } });
    await fixture.whenStable();
    const active = [...group('Filtres actifs')!.querySelectorAll('button')];
    expect(active.map(text)).toEqual(['Anxiété 3', 'anger 0', '#sommeil 2']);
    expect(active.every((chip) => chip.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(active[0].getAttribute('aria-label')).toBe('Anxiété 3, retirer le filtre');
    expect(text(button('Filtres'))).toBe('Filtres (3)');
    const panel = await openMenu();
    const checked = panel.querySelectorAll('[role="menuitemcheckbox"][aria-checked="true"]');
    expect([...checked].map(text)).toEqual(['Anxiété 3', 'anger 0', '#sommeil 2']);
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    active[1].click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.emotions).toEqual(['anxiety']);
  });

  it('brouillons seulement', async () => {
    const { fixture, host, button } = await render();
    button('Brouillons seulement').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.draftsOnly).toBe(true);
    expect(button('Brouillons seulement').getAttribute('aria-pressed')).toBe('true');
  });

  it('sans facette d’émotion ni de tag : pas de bouton « Filtres »', async () => {
    const { el } = await render((h) =>
      h.facets.set({ types: { note: 2 }, emotions: {}, tags: {} }),
    );
    expect([...el.querySelectorAll('button')].some((b) => text(b).startsWith('Filtres'))).toBe(
      false,
    );
  });

  it('médicament masqué par la préférence, sauf s’il est choisi', async () => {
    const { fixture, host, group } = await render((h) => h.medicationVisible.set(false));
    const names = () => [...group('Types')!.querySelectorAll('button')].map(text);
    expect(names().some((name) => name.startsWith('Médicament'))).toBe(false);
    host.filters.set({ ...NO_FILTERS, types: ['medication'] });
    await fixture.whenStable();
    expect(names().some((name) => name.startsWith('Médicament'))).toBe(true);
  });

  it('barre d’outils : un seul arrêt de tabulation, ← → Début Fin', async () => {
    const { fixture, el, button } = await render();
    await fixture.whenStable();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0].tabIndex).toBe(0);
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    buttons[0].focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(button('Note'));
    press('ArrowLeft');
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons.at(-1));
    press('Home');
    expect(document.activeElement).toBe(buttons[0]);
    press('End');
    expect(document.activeElement).toBe(buttons.at(-1));
    await fixture.whenStable();
    expect(buttons.at(-1)!.tabIndex).toBe(0);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });
});
