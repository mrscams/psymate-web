// Style du canevas Cytoscape (fiche 04 « Tokens », étude couleurs §4) : une fonction pure des tokens
// CSS de src/theme/tokens.css, lus par getComputedStyle au démarrage et à chaque changement de thème
// (data-theme sur <html>). Aucune couleur écrite ici : seulement des noms de tokens.
import type { StylesheetJson } from 'cytoscape';

import { EntryType } from '../../../shared/ui';
import { LinkLineStyle, LinkTypeCode } from '../data/link.model';

/** Les tokens lus pour le canevas (noms de variables CSS de l'étude couleurs §8). */
export const GRAPH_TOKEN_NAMES = {
  surface: '--surface-raised',
  sunken: '--surface-sunken',
  border: '--border-strong',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  primary: '--primary',
  primaryTint: '--primary-tint',
  feeling: '--feeling',
  feelingTint: '--feeling-tint',
  feelingText: '--feeling-text',
  link: '--link',
  linkProposed: '--link-proposed',
  font: '--font-ui',
  entryNote: '--entry-note',
  entryEvent: '--entry-event',
  entrySituation: '--entry-situation',
  entryFeeling: '--entry-feeling',
  entrySession: '--entry-session',
  entryMedication: '--entry-medication',
} as const;

export type GraphTokens = Record<keyof typeof GRAPH_TOKEN_NAMES, string>;

/** Lit les tokens avec `read(nom)` (getComputedStyle(el).getPropertyValue en vrai). */
export function readGraphTokens(read: (name: string) => string): GraphTokens {
  const tokens = {} as GraphTokens;
  for (const [key, name] of Object.entries(GRAPH_TOKEN_NAMES)) {
    tokens[key as keyof GraphTokens] = read(name).trim();
  }
  return tokens;
}

/** Style de trait par défaut (étude couleurs §4), quand le catalogue n'est pas encore lu. */
export const DEFAULT_LINE_STYLES: Record<LinkTypeCode, LinkLineStyle> = {
  triggers: 'solid',
  caused_by: 'solid',
  worsens: 'long_dash',
  relieves: 'short_dash',
  co_occurs: 'dotted',
  follows: 'thin',
  part_of: 'thin',
  treats: 'double',
};

/** Diamètre d'un ressenti : r = 14 + 2,2 × intensité px (fiche 04 « Tokens »). */
export function feelingDiameter(intensity: number | null): number {
  const value = Math.min(10, Math.max(0, intensity ?? 0));
  return Math.round(2 * (14 + 2.2 * value));
}

/**
 * Un ressenti assez grand pour porter son chiffre d'intensité en aplat lavande et texte clair
 * (UX-B3, fiche 04 « Accessibilité ») : rayon ≥ 24 px, chiffre en gras ≥ 19 px (grand texte, 3:1
 * suffit : blanc sur #8B7BD6 fait 3,6:1). En dessous, teinte légère et `feeling-text`.
 */
export const STRONG_FEELING_DIAMETER = 48;

/** Taille du chiffre d'intensité dans un cercle de ce diamètre. */
export function intensityFontSize(diameter: number): number {
  return Math.max(11, Math.min(26, Math.round(diameter * 0.4)));
}

/**
 * Le chiffre d'intensité au centre d'un ressenti (fiche 04 : « chiffre d'intensité à l'intérieur ») :
 * Cytoscape n'a qu'une étiquette par nœud (« titre · date », dessous), le chiffre est donc une image
 * SVG de fond, dans la couleur et la police des tokens. 'none' sans intensité.
 */
export function intensityImage(
  intensity: number | null | undefined,
  diameter: number,
  tokens: Pick<GraphTokens, 'font' | 'surface' | 'feelingText'>,
): string {
  if (intensity === null || intensity === undefined || !Number.isFinite(intensity)) return 'none';
  const value = Math.round(Math.min(10, Math.max(0, intensity)));
  const size = Math.max(1, Math.round(diameter));
  const strong = size >= STRONG_FEELING_DIAMETER;
  const colour = strong ? tokens.surface : tokens.feelingText;
  const font = tokens.font.replace(/"/g, "'");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="${font}" ` +
    `font-size="${intensityFontSize(size)}" font-weight="700" fill="${colour}">${value}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ENTRY_TOKEN: Record<EntryType, keyof GraphTokens> = {
  note: 'entryNote',
  event: 'entryEvent',
  situation: 'entrySituation',
  feeling: 'entryFeeling',
  session: 'entrySession',
  medication: 'entryMedication',
};

/** Forme et taille par type (étude couleurs §4, fiche 00 « Tokens »). */
const SHAPES: Record<
  Exclude<EntryType, 'feeling'>,
  { shape: string; width: number; height: number; radius?: number }
> = {
  note: { shape: 'rectangle', width: 30, height: 36 },
  event: { shape: 'diamond', width: 40, height: 40 },
  situation: { shape: 'round-rectangle', width: 64, height: 20, radius: 4 },
  session: { shape: 'round-rectangle', width: 36, height: 36, radius: 9 },
  medication: { shape: 'round-rectangle', width: 52, height: 22, radius: 11 },
};

/**
 * Le trait d'un style de lien (étude couleurs §4 : même couleur, styles de trait). Cytoscape n'a pas
 * de trait double pour une arête : `double` est dessiné dans graphStylesheet (trait de la couleur du
 * fond bordé de deux filets `link`).
 */
const LINE: Record<Exclude<LinkLineStyle, 'double'>, Record<string, unknown>> = {
  solid: { 'line-style': 'solid', width: 1.5 },
  long_dash: { 'line-style': 'dashed', 'line-dash-pattern': [9, 5], width: 1.5 },
  short_dash: { 'line-style': 'dashed', 'line-dash-pattern': [4, 4], width: 1.5 },
  dotted: { 'line-style': 'dotted', width: 1.5 },
  thin: { 'line-style': 'solid', width: 1 },
};

/**
 * Feuille de style Cytoscape du graphe, depuis les tokens :
 * - nœuds : forme par type, bordure 2 px de la couleur du type sur une teinte légère (jamais en
 *   aplat), étiquette « titre · date » sous le nœud ; ressentis en cercle, diamètre selon l'intensité,
 *   seuls nœuds lavande ; racine plus grande, bordure `primary` ;
 * - super-nœuds : rectangle en pointillés sur `surface-sunken` ;
 * - liens : trait `link`, style par type (classe `line-<style>`), flèche si dirigé, `proposed` en
 *   pointillé `link-proposed` avec « suggéré » (V2) ;
 * - sélection d'un nœud : `primary` et halo `primary-tint` (les arêtes ne se sélectionnent pas : leur
 *   détail passe par la liste équivalente).
 */
export function graphStylesheet(tokens: GraphTokens): StylesheetJson {
  const sheet: { selector: string; style: Record<string, unknown> }[] = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: tokens.text,
        'font-family': tokens.font,
        'font-size': 12,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'text-wrap': 'ellipsis',
        'text-max-width': '160px',
        'text-background-color': tokens.surface,
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
        'background-color': tokens.surface,
        'border-width': 2,
        'border-color': tokens.border,
        'overlay-opacity': 0,
      },
    },
    ...Object.entries(SHAPES).map(([type, shape]) => ({
      selector: `node.type-${type}`,
      style: {
        shape: shape.shape,
        width: shape.width,
        height: shape.height,
        ...(shape.radius ? { 'corner-radius': String(shape.radius) } : {}),
        'border-color': tokens[ENTRY_TOKEN[type as EntryType]],
        'background-color': tokens[ENTRY_TOKEN[type as EntryType]],
        'background-opacity': 0.16,
      },
    })),
    {
      selector: 'node.type-feeling',
      style: {
        shape: 'ellipse',
        width: 'data(size)',
        height: 'data(size)',
        'border-color': tokens.feeling,
        'background-color': tokens.feelingTint,
        'background-opacity': 1,
        // Le chiffre d'intensité, image SVG centrée (une seule étiquette par nœud dans Cytoscape).
        'background-image': (node: { data(name: string): unknown }) =>
          intensityImage(
            node.data('intensity') as number | null,
            Number(node.data('size')) || 0,
            tokens,
          ),
        'background-fit': 'none',
        'background-clip': 'none',
        'background-image-containment': 'over',
      },
    },
    {
      // Grand cercle : aplat lavande, chiffre clair (voir STRONG_FEELING_DIAMETER).
      selector: 'node.type-feeling.strong',
      style: { 'background-color': tokens.feeling },
    },
    {
      selector: 'node.root',
      style: {
        'border-width': 3,
        'border-color': tokens.primary,
        'font-weight': 600,
      },
    },
    {
      selector: 'node.group',
      style: {
        shape: 'round-rectangle',
        'corner-radius': '8',
        width: 190,
        height: 44,
        'background-color': tokens.sunken,
        'background-opacity': 1,
        'border-width': 1.5,
        'border-style': 'dashed',
        'border-color': tokens.border,
        color: tokens.text,
        'text-valign': 'center',
        'text-margin-y': 0,
        'text-wrap': 'wrap',
        'text-max-width': '176px',
        'text-background-opacity': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'line-color': tokens.link,
        width: 1.5,
        'target-arrow-shape': 'none',
        'target-arrow-color': tokens.link,
        'arrow-scale': 0.9,
        'overlay-opacity': 0,
      },
    },
    ...Object.entries(LINE).map(([style, line]) => ({
      selector: `edge.line-${style}`,
      style: line,
    })),
    {
      selector: 'edge.line-double',
      style: {
        'line-style': 'solid',
        width: 1.5,
        'line-color': tokens.surface,
        'line-outline-width': 1.25,
        'line-outline-color': tokens.link,
      },
    },
    { selector: 'edge.directed', style: { 'target-arrow-shape': 'triangle' } },
    {
      selector: 'edge.proposed',
      style: {
        'line-color': tokens.linkProposed,
        'target-arrow-color': tokens.linkProposed,
        'line-style': 'dotted',
        label: 'data(label)',
        color: tokens.textSecondary,
        'font-family': tokens.font,
        'font-size': 10,
        'text-background-color': tokens.surface,
        'text-background-opacity': 1,
      },
    },
    {
      selector: 'edge.group-edge',
      style: { 'line-style': 'dashed', 'line-dash-pattern': [2, 4], width: 1 },
    },
    {
      // Nœud sélectionné : son étiquette revient même au-delà de LABELS_MAX_NODES.
      selector: 'node:selected',
      style: {
        label: 'data(name)',
        'border-color': tokens.primary,
        'border-width': 3,
        'underlay-color': tokens.primaryTint,
        'underlay-padding': 4,
        'underlay-opacity': 1,
      },
    },
    { selector: 'node.link-target', style: { 'border-color': tokens.primary, 'border-width': 3 } },
  ];
  return sheet as unknown as StylesheetJson;
}
