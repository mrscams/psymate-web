import { tokenNames } from '../data/graph.fixtures';
import {
  DEFAULT_LINE_STYLES,
  feelingDiameter,
  GRAPH_TOKEN_NAMES,
  graphStylesheet,
  readGraphTokens,
} from './graph-style';

interface Block {
  selector: string;
  style: Record<string, unknown>;
}

function sheet(): Block[] {
  return graphStylesheet(readGraphTokens(tokenNames)) as unknown as Block[];
}

/** Le style fusionné d'un sélecteur exact (dans l'ordre de la feuille). */
function styleOf(selector: string): Record<string, unknown> {
  return sheet()
    .filter((block) => block.selector === selector)
    .reduce((all, block) => ({ ...all, ...block.style }), {});
}

const tok = (name: string) => `tok(${name})`;

describe('graph-style : tokens → feuille de style Cytoscape', () => {
  it('readGraphTokens lit chaque token par son nom CSS, sans espaces', () => {
    const read = vi.fn(tokenNames);
    const tokens = readGraphTokens(read);
    expect(read).toHaveBeenCalledWith('--entry-feeling');
    expect(read).toHaveBeenCalledWith('--link-proposed');
    expect(Object.keys(tokens)).toEqual(Object.keys(GRAPH_TOKEN_NAMES));
    expect(tokens.primary).toBe(tok('--primary'));
  });

  it('aucune couleur écrite : chaque couleur de la feuille vient d’un token', () => {
    const colours = sheet().flatMap((block) =>
      Object.entries(block.style)
        .filter(([key]) => /color$/.test(key))
        .map(([, value]) => value),
    );
    expect(colours.length).toBeGreaterThan(20);
    for (const value of colours) expect(String(value)).toMatch(/^tok\(--[a-z-]+\)$/);
  });

  it('forme et couleur par type d’entrée (étude couleurs §4)', () => {
    expect(styleOf('node.type-event')).toMatchObject({
      shape: 'diamond',
      'border-color': tok('--entry-event'),
      'background-color': tok('--entry-event'),
    });
    expect(styleOf('node.type-situation')).toMatchObject({
      shape: 'round-rectangle',
      'border-color': tok('--entry-situation'),
    });
    expect(styleOf('node.type-session')).toMatchObject({
      shape: 'round-rectangle',
      'border-color': tok('--entry-session'),
    });
    expect(styleOf('node.type-medication')).toMatchObject({
      shape: 'round-rectangle',
      'corner-radius': '11',
      'border-color': tok('--entry-medication'),
    });
    expect(styleOf('node.type-note')).toMatchObject({
      shape: 'rectangle',
      'border-color': tok('--entry-note'),
    });
    // Les ressentis sont les seuls nœuds lavande, en cercle, taille selon l'intensité.
    expect(styleOf('node.type-feeling')).toMatchObject({
      shape: 'ellipse',
      width: 'data(size)',
      'border-color': tok('--feeling'),
      'background-color': tok('--feeling-tint'),
    });
    const lavender = sheet().filter((block) =>
      Object.values(block.style).some((value) => String(value).includes('--feeling')),
    );
    expect(lavender.map((block) => block.selector)).toEqual(['node.type-feeling']);
  });

  it('racine, super-nœud, sélection', () => {
    expect(styleOf('node.root')).toMatchObject({ 'border-color': tok('--primary') });
    expect(styleOf('node.group')).toMatchObject({
      'border-style': 'dashed',
      'background-color': tok('--surface-sunken'),
    });
    expect(styleOf('node:selected')).toMatchObject({
      'border-color': tok('--primary'),
      'underlay-color': tok('--primary-tint'),
    });
  });

  it('trait par style de lien, flèche si dirigé, pointillé clair pour proposed', () => {
    expect(styleOf('edge')).toMatchObject({
      'line-color': tok('--link'),
      'target-arrow-shape': 'none',
    });
    expect(styleOf('edge.directed')).toMatchObject({ 'target-arrow-shape': 'triangle' });
    expect(styleOf('edge.line-solid')).toMatchObject({ 'line-style': 'solid', width: 1.5 });
    expect(styleOf('edge.line-long_dash')).toMatchObject({
      'line-style': 'dashed',
      'line-dash-pattern': [9, 5],
    });
    expect(styleOf('edge.line-short_dash')).toMatchObject({
      'line-style': 'dashed',
      'line-dash-pattern': [4, 4],
    });
    expect(styleOf('edge.line-dotted')).toMatchObject({ 'line-style': 'dotted' });
    expect(styleOf('edge.line-thin')).toMatchObject({ 'line-style': 'solid', width: 1 });
    // Trait double : fond du canevas bordé de deux filets `link` (pas de trait double dans Cytoscape).
    expect(styleOf('edge.line-double')).toMatchObject({
      'line-style': 'solid',
      'line-color': tok('--surface-raised'),
      'line-outline-color': tok('--link'),
    });
    expect(styleOf('edge.proposed')).toMatchObject({
      'line-style': 'dotted',
      'line-color': tok('--link-proposed'),
      label: 'data(label)',
    });
  });

  it('styles par défaut des types de liens et diamètre des ressentis', () => {
    expect(DEFAULT_LINE_STYLES).toMatchObject({
      triggers: 'solid',
      worsens: 'long_dash',
      relieves: 'short_dash',
      co_occurs: 'dotted',
      follows: 'thin',
      treats: 'double',
    });
    expect(feelingDiameter(0)).toBe(28);
    expect(feelingDiameter(10)).toBe(72);
    expect(feelingDiameter(null)).toBe(28);
    expect(feelingDiameter(42)).toBe(72);
  });
});
