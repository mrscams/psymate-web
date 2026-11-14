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
      >
        <p filtersExtra class="extra-probe">période et mode</p>
      </pm-timeline-filters>
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
  /** Ouvre le panneau « Filtres » ; il est rendu dans l'overlay CDK. */
  const openPanel = async () => {
    button('Filtres').click();
    await fixture.whenStable();
    return document.querySelector<HTMLElement>('#timeline-filters-panel')!;
  };
  return { fixture, host: fixture.componentInstance, el, group, button, openPanel };
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

describe('TimelineFiltersComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('sans lecture réussie (chargement, erreur) : puces sans compteur, pas de « 0 »', async () => {
    const { el, group } = await render((host) => host.counted.set(false));
    expect(el.querySelector('.chips .n')).toBeNull();
    const types = [...group('Types')!.querySelectorAll('button')].map(text);
    expect(types).toContain('Notes');
    expect(types).toContain('Événements');
  });

  it('puces de la maquette : « Tout » (total), puis Ressentis, Notes, Événements, Situations, Médicaments', async () => {
    const { group } = await render();
    const chips = [...group('Types')!.querySelectorAll('button')];
    expect(chips.map(text)).toEqual([
      'Tout 17',
      'Ressentis 3',
      'Notes 12',
      'Événements 0',
      'Situations 0',
      'Médicaments 0',
    ]);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].querySelector('pm-entry-icon')).not.toBeNull();
  });

  it('puce de type : bascule, « Tout » réinitialise ; Séances seulement quand le filtre la porte', async () => {
    const { fixture, host, group, button } = await render();
    button('Notes').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)!.types).toEqual(['note']);
    expect(button('Notes').getAttribute('aria-pressed')).toBe('true');
    button('Tout').click();
    expect(host.changes.at(-1)!.types).toEqual([]);
    host.filters.set({ ...NO_FILTERS, types: ['session'] });
    await fixture.whenStable();
    const names = [...group('Types')!.querySelectorAll('button')].map(text);
    expect(names.at(-1)).toBe('Séances 2');
  });

  it('un seul bouton « Filtres » : ce qu’il propose, ou combien sont actifs', async () => {
    const { fixture, host, button } = await render();
    const filters = button('Filtres');
    expect(words(filters)).toBe('Filtres · émotion, tag, brouillons');
    expect(filters.getAttribute('aria-expanded')).toBe('false');
    expect(filters.getAttribute('aria-haspopup')).toBe('dialog');
    host.filters.set({ ...NO_FILTERS, emotions: ['anxiety'], draftsOnly: true });
    await fixture.whenStable();
    expect(words(filters)).toBe('Filtres · 2');
    expect(filters.getAttribute('aria-label')).toBe('Filtres · 2 actifs');
    expect(filters.classList).toContain('has-active');
  });

  it('panneau : émotions (les plus fréquentes d’abord, pastille de famille), tags, brouillons, contenu projeté', async () => {
    const { fixture, host, openPanel, button } = await render();
    const panel = await openPanel();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(button('Filtres').getAttribute('aria-expanded')).toBe('true');
    const emotions = [...panel.querySelectorAll<HTMLButtonElement>('[data-emotion]')];
    expect(emotions.map(text)).toEqual(['Anxiété 3', 'Joie 1']);
    expect(emotions[0].querySelector('.dot.family-fear')).not.toBeNull();
    expect(text(panel.querySelector('.extra-probe'))).toBe('période et mode');
    emotions[0].click();
    await fixture.whenStable();
    expect(host.changes.at(-1)!.emotions).toEqual(['anxiety']);
    panel.querySelector<HTMLButtonElement>('[data-tag="sommeil"]')!.click();
    await fixture.whenStable();
    expect(host.changes.at(-1)!.tags).toEqual(['sommeil']);
    const drafts = [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      text(b).startsWith('Brouillons seulement'),
    )!;
    drafts.click();
    await fixture.whenStable();
    expect(host.changes.at(-1)!.draftsOnly).toBe(true);
    expect(drafts.getAttribute('aria-pressed')).toBe('true');
  });

  it('panneau : Échap le ferme et rend le focus au bouton ; facettes vides annoncées', async () => {
    const { fixture, host, openPanel, button } = await render((h) =>
      h.facets.set({ types: { note: 1 }, emotions: {}, tags: {} }),
    );
    const panel = await openPanel();
    expect(text(panel)).toContain('Aucune émotion notée sur la période.');
    expect(text(panel)).toContain('Aucun tag sur la période.');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(document.querySelector('#timeline-filters-panel')).toBeNull();
    expect(document.activeElement).toBe(button('Filtres'));
    expect(host.changes).toEqual([]);
  });

  it('médicaments masqués par la préférence, sauf s’ils sont choisis', async () => {
    const { fixture, host, group } = await render((h) => h.medicationVisible.set(false));
    const names = () => [...group('Types')!.querySelectorAll('button')].map(text);
    expect(names().some((name) => name.startsWith('Médicaments'))).toBe(false);
    host.filters.set({ ...NO_FILTERS, types: ['medication'] });
    await fixture.whenStable();
    expect(names().some((name) => name.startsWith('Médicaments'))).toBe(true);
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
    expect(document.activeElement).toBe(button('Ressentis'));
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
