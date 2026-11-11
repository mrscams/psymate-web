import { TestBed } from '@angular/core/testing';

import { edge, graphView, superNode } from '../data/graph.fixtures';
import { GraphView } from '../data/graph.model';
import { GraphLinksTableComponent } from './graph-links-table.component';

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function render(view: GraphView) {
  const fixture = TestBed.createComponent(GraphLinksTableComponent);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('names', {
    'e-situation': 'Surcharge au travail',
    'e-feeling': 'Anxiété 8',
    'e-event': "Entretien d'évaluation",
    'e-med': 'Sertraline 50 mg',
  });
  fixture.componentRef.setInput('linkLabels', { worsens: 'aggrave', triggers: 'déclenche' });
  fixture.componentRef.setInput('emotionLabels', { anxiety: 'Anxiété' });
  fixture.detectChanges();
  const selected: string[] = [];
  const expanded: string[] = [];
  fixture.componentInstance.selectEntry.subscribe((id) => selected.push(id));
  fixture.componentInstance.expandGroup.subscribe((id) => expanded.push(id));
  return { el: fixture.nativeElement as HTMLElement, selected, expanded, fixture };
}

describe('GraphLinksTableComponent', () => {
  it('tableau source · lien · cible · provenance · statut, les mêmes liens que le canevas', () => {
    const { el, selected } = render(graphView());
    expect(text(el.querySelector('caption'))).toBe('Liens du graphe (même contenu que le canevas)');
    expect([...el.querySelectorAll('th')].map(text)).toEqual([
      'Source',
      'Lien',
      'Cible',
      'Provenance',
      'Statut',
    ]);
    const rows = [...el.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map(text),
    );
    expect(rows).toEqual([
      ['Surcharge au travail', 'aggrave', 'Anxiété 8', 'manuel', 'accepté'],
      ["Entretien d'évaluation", 'déclenche', 'Surcharge au travail', 'manuel', 'accepté'],
      ['Sertraline 50 mg', 'treats', 'Anxiété 8', 'manuel', 'accepté'],
    ]);
    // Chaque extrémité est un bouton (clavier) qui sélectionne l'entrée.
    const buttons = el.querySelectorAll<HTMLButtonElement>('tbody button');
    expect(buttons).toHaveLength(6);
    buttons[0].click();
    buttons[3].click();
    expect(selected).toEqual(['e-situation', 'e-situation']);
  });

  it('super-nœuds : tableau « Groupes », sélection du groupe et du voisin, Déplier', () => {
    const { el, selected, expanded, fixture } = render(graphView({ superNodes: [superNode()] }));
    const groups = el.querySelector('table.groups')!;
    expect(text(groups.querySelector('caption'))).toBe(
      'Groupes d’entrées regroupées (à déplier)'.replace('’', "'"),
    );
    const cells = [...groups.querySelectorAll('tbody td')].map(text);
    expect(cells).toEqual([
      '3 ressentis regroupés · anxiété majoritaire',
      'Surcharge au travail',
      'Déplier',
    ]);
    const buttons = groups.querySelectorAll<HTMLButtonElement>('tbody button');
    expect(buttons[2].getAttribute('aria-label')).toBe(
      'Déplier : 3 ressentis regroupés · anxiété majoritaire',
    );
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    expect(selected).toEqual(['sn:e-situation:feeling', 'e-situation']);
    expect(expanded).toEqual(['sn:e-situation:feeling']);

    fixture.componentRef.setInput('expanding', true);
    fixture.detectChanges();
    expect(groups.querySelector<HTMLButtonElement>('button.expand')?.disabled).toBe(true);
  });

  it('plus de 20 liens : paginés par 20, « Précédents / Suivants », retour page 1 si le graphe change', () => {
    const edges = Array.from({ length: 45 }, (_, i) =>
      edge({ id: `l-${i}`, source: 'e-situation', target: 'e-feeling' }),
    );
    const { el, fixture } = render(graphView({ edges }));
    expect(el.querySelectorAll('tbody tr')).toHaveLength(20);
    const range = () => text(el.querySelector('.pager .range'));
    expect(range()).toBe('Liens 1 à 20 sur 45');
    expect(el.querySelector('.pager .range')?.getAttribute('aria-live')).toBe('polite');
    const [previous, next] = [...el.querySelectorAll<HTMLButtonElement>('.pager button')];
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    next.click();
    fixture.detectChanges();
    next.click();
    fixture.detectChanges();
    expect(range()).toBe('Liens 41 à 45 sur 45');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    previous.click();
    fixture.detectChanges();
    expect(range()).toBe('Liens 21 à 40 sur 45');
    fixture.componentRef.setInput('view', graphView({ edges: edges.slice(0, 30) }));
    fixture.detectChanges();
    expect(range()).toBe('Liens 1 à 20 sur 30');
  });

  it('20 liens ou moins : pas de pagination', () => {
    const { el } = render(graphView());
    expect(el.querySelector('.pager')).toBeNull();
  });

  it('aucun lien : état vide', () => {
    const { el } = render(graphView({ edges: [] }));
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('table.groups')).toBeNull();
    expect(text(el.querySelector('pm-state [role="status"]'))).toContain(
      'Aucun lien dans ce graphe',
    );
  });
});
