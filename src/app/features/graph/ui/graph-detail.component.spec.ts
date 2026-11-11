import { TestBed } from '@angular/core/testing';

import { failed, idle, loaded, Loadable, loading } from '../../../shared/util';
import { node, superNode } from '../data/graph.fixtures';
import { NodeDetail } from '../data/graph.store';
import { link, source } from '../data/link.fixtures';
import { GraphDetailComponent } from './graph-detail.component';

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const feeling = node({
  id: 'e-feeling',
  type: 'feeling',
  title: null,
  intensity: 8,
  emotion: 'anxiety',
});

function render(inputs: {
  detail?: Loadable<NodeDetail>;
  node?: ReturnType<typeof node> | null;
  group?: ReturnType<typeof superNode> | null;
  root?: string | null;
  expandProblem?: { status: number; code: string } | null;
}) {
  const fixture = TestBed.createComponent(GraphDetailComponent);
  fixture.componentRef.setInput('detail', inputs.detail ?? idle());
  fixture.componentRef.setInput('node', inputs.node ?? null);
  fixture.componentRef.setInput('group', inputs.group ?? null);
  fixture.componentRef.setInput('root', inputs.root ?? null);
  fixture.componentRef.setInput('emotionLabels', { anxiety: 'Anxiété' });
  fixture.componentRef.setInput('expandProblem', inputs.expandProblem ?? null);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const emitted: Record<string, unknown[]> = {};
  const component = fixture.componentInstance;
  for (const name of [
    'closed',
    'recenter',
    'showInTimeline',
    'link',
    'edit',
    'expand',
    'retry',
    'selectEntry',
  ] as const) {
    emitted[name] = [];
    (component[name] as { subscribe(fn: (v: unknown) => void): void }).subscribe((value) =>
      emitted[name].push(value),
    );
  }
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
  return { fixture, el, emitted, button };
}

describe('GraphDetailComponent', () => {
  it('panneau complémentaire, titre et type ; chargement du détail (squelette)', () => {
    const { el } = render({ node: feeling, detail: loading() });
    const aside = el.querySelector('aside')!;
    expect(aside.getAttribute('role')).toBe('complementary');
    expect(aside.getAttribute('aria-labelledby')).toBe('graph-detail-title');
    // Titre de repli partagé (UX-A5) : émotion, intensité et date courte.
    expect(text(el.querySelector('h2'))).toMatch(/^Anxiété 8\/10 · 1 mars/);
    expect(text(el.querySelector('.type-chip'))).toBe('Ressenti');
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
  });

  it('erreur 5xx : Réessayer ; 404 : sans Réessayer', () => {
    const { el, emitted, button } = render({
      node: feeling,
      detail: failed({ status: 503, code: 'INTERNAL_ERROR' }),
    });
    expect(text(el.querySelector('pm-state [role="alert"]'))).toContain(
      'Impossible de charger cette entrée',
    );
    button('Réessayer').click();
    expect(emitted['retry']).toHaveLength(1);

    TestBed.resetTestingModule();
    const gone = render({
      node: feeling,
      detail: failed({ status: 404, code: 'ENTRY_NOT_FOUND' }),
    });
    expect(gone.button('Réessayer')).toBeUndefined();
  });

  it('chargé : quand, émotion, texte, liens en phrases (liste équivalente), actions', () => {
    const detail = loaded<NodeDetail>({
      entry: source(),
      links: [
        link(),
        link({ id: 'l-2', sentence: '', label: 'déclenché par', sourceId: 'e-event' }),
      ],
    });
    const { el, emitted, button } = render({ node: feeling, detail, root: 'e-situation' });
    expect(text(el.querySelector('.facts'))).toContain('Quand');
    expect(text(el.querySelector('.facts'))).toContain('Anxiété · intensité 8/10');
    expect(text(el.querySelector('.text'))).toBe("N'a pas dormi avant l'entretien.");
    expect(text(el.querySelector('.links-title'))).toBe('Liens de cette entrée · 2');
    const sentences = [...el.querySelectorAll('.links button')];
    expect(sentences.map(text)).toEqual([
      'Anxiété 8/10 aggravé par Recherche d’emploi depuis septembre',
      'déclenché par',
    ]);
    (sentences[0] as HTMLButtonElement).click();
    (sentences[1] as HTMLButtonElement).click();
    expect(emitted['selectEntry']).toEqual(['e-situation', 'e-event']);

    button('Lier (L)').click();
    button('Voir dans la timeline').click();
    button('Recentrer le graphe ici').click();
    button("Corriger l'entrée").click();
    (el.querySelector('button.close') as HTMLButtonElement).click();
    expect(emitted['link']).toEqual(['e-feeling']);
    expect(emitted['showInTimeline']).toEqual(['e-feeling']);
    expect(emitted['recenter']).toEqual(['e-feeling']);
    expect(emitted['edit']).toEqual(['e-feeling']);
    expect(emitted['closed']).toHaveLength(1);
  });

  it('entrée sans lien : état vide de la liste ; racine : pas de « Recentrer »', () => {
    const { el, button } = render({
      node: feeling,
      root: 'e-feeling',
      detail: loaded<NodeDetail>({ entry: source(), links: [] }),
    });
    expect(text(el.querySelector('.muted'))).toBe('Aucun lien sur cette entrée pour le moment.');
    expect(button('Recentrer le graphe ici')).toBeUndefined();
  });

  it('super-nœud : explication, Déplier, recentrer sur le voisin, erreur de dépliage', () => {
    const { el, emitted, button } = render({
      group: superNode(),
      expandProblem: { status: 500, code: 'INTERNAL_ERROR' },
    });
    expect(text(el.querySelector('h2'))).toBe('3 ressentis regroupés · anxiété majoritaire');
    expect(text(el.querySelector('.text'))).toContain('3 ressentis reliés à la même entrée');
    expect(text(el.querySelector('[role="alert"]'))).toBe(
      'Le groupe n’a pas pu être déplié. Réessayez.'.replace('’', "'"),
    );
    button('Déplier').click();
    button("Recentrer sur l'entrée voisine").click();
    expect(emitted['expand']).toEqual(['sn:e-situation:feeling']);
    expect(emitted['recenter']).toEqual(['e-situation']);
  });
});
