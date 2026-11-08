import { TestBed } from '@angular/core/testing';

import { graphView } from '../data/graph.fixtures';
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
  fixture.detectChanges();
  const selected: string[] = [];
  fixture.componentInstance.selectEntry.subscribe((id) => selected.push(id));
  return { el: fixture.nativeElement as HTMLElement, selected };
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

  it('aucun lien : état vide', () => {
    const { el } = render(graphView({ edges: [] }));
    expect(el.querySelector('table')).toBeNull();
    expect(text(el.querySelector('pm-state [role="status"]'))).toContain(
      'Aucun lien dans ce graphe',
    );
  });
});
