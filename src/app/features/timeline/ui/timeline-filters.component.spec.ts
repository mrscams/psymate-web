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
        [emotionLabels]="{ anxiety: 'Anxiété', joy: 'Joie' }"
        [emotionFamilies]="{ anxiety: 'fear', joy: 'joy' }"
        [medicationVisible]="medicationVisible()"
        [today]="today"
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
  readonly today = new Date(2026, 10, 8, 14);
  readonly changes: TimelineFilters[] = [];
}

async function render(setup: (host: HostComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(HostComponent);
  setup(fixture.componentInstance);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const group = (name: string) => el.querySelector(`[role="group"][aria-label="${name}"]`);
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(name))!;
  return { fixture, host: fixture.componentInstance, el, group, button };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TimelineFiltersComponent', () => {
  it('Types : Tous + un par type, compteurs des facettes (0 si absent), aria-pressed', async () => {
    const { group, button } = await render();
    const types = [...group('Types')!.querySelectorAll('button')].map(text);
    expect(types).toEqual([
      'Tous',
      'Note 12',
      'Événement 0',
      'Situation 0',
      'Ressenti 3',
      'Séance 2',
      'Médicament 0',
    ]);
    expect(button('Tous').getAttribute('aria-pressed')).toBe('true');
    expect(button('Note').getAttribute('aria-pressed')).toBe('false');
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

  it('émotions : les plus fréquentes d’abord, libellé et pastille de famille ; la choisie reste à zéro', async () => {
    const { fixture, host, group, button } = await render();
    const emotions = [...group('Émotions')!.querySelectorAll('button')];
    expect(emotions.map(text)).toEqual(['Anxiété 3', 'Joie 1']);
    expect(emotions[0].querySelector('.dot')?.classList).toContain('family-fear');
    button('Anxiété').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.emotions).toEqual(['anxiety']);
    // Réponse filtrée : seule l'anxiété compte ; une émotion choisie absente des facettes reste.
    host.filters.set({ ...host.filters(), emotions: ['anxiety', 'anger'] });
    host.facets.set({ types: { feeling: 3 }, emotions: { anxiety: 3 }, tags: {} });
    await fixture.whenStable();
    expect([...group('Émotions')!.querySelectorAll('button')].map(text)).toEqual([
      'Anxiété 3',
      'anger 0',
    ]);
    expect(group('Tags')).toBeNull();
  });

  it('tags, brouillons seulement, période', async () => {
    const { fixture, host, button, group } = await render();
    button('#sommeil').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.tags).toEqual(['sommeil']);
    button('Brouillons seulement').click();
    await fixture.whenStable();
    expect(host.changes.at(-1)?.draftsOnly).toBe(true);
    expect(button('Brouillons seulement').getAttribute('aria-pressed')).toBe('true');

    const period = [...group('Période')!.querySelectorAll('button')];
    expect(period.map(text)).toEqual(['30 j', '90 j', '1 an', 'Tout']);
    expect(period[3].getAttribute('aria-pressed')).toBe('true');
    period[1].click();
    await fixture.whenStable();
    expect(host.changes.at(-1)).toMatchObject({ from: '2026-08-10', to: null });
    expect(period[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('période libre (URL) : ses bornes affichées, aucune puce active', async () => {
    const { el, group } = await render((host) =>
      host.filters.set({ ...NO_FILTERS, from: '2026-01-01', to: '2026-03-31' }),
    );
    expect(text(el.querySelector('.custom'))).toBe('Du 1 janv. 2026 au 31 mars 2026');
    const pressed = group('Période')!.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(0);
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
