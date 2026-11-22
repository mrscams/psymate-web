// Géométrie des traits du graphe (fonctions pures) : du tracé rendu par la disposition (une suite de
// points à angles droits) au chemin SVG.
import { Point } from '../data/graph.model';
import { Box } from './graph-layout';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Le point à `length` de `from`, en allant vers `to`. */
function toward(from: Point, to: Point, length: number): Point {
  const total = distance(from, to) || 1;
  return {
    x: from.x + ((to.x - from.x) * length) / total,
    y: from.y + ((to.y - from.y) * length) / total,
  };
}

const round = (value: number) => Math.round(value * 10) / 10;
const at = (point: Point) => `${round(point.x)},${round(point.y)}`;

/** Chemin SVG passant par les points, angles arrondis. */
export function roundedPath(points: Point[], radius = 10): string {
  if (points.length < 2) return '';
  let path = `M${at(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1];
    const corner = points[i];
    const after = points[i + 1];
    const r = Math.min(radius, distance(before, corner) / 2, distance(corner, after) / 2);
    path += ` L${at(toward(corner, before, r))} Q${at(corner)} ${at(toward(corner, after, r))}`;
  }
  return `${path} L${at(points[points.length - 1])}`;
}

/**
 * Le tracé raccourci du côté de la flèche : le trait s'arrête sous la pointe au lieu de dépasser
 * (visible sur un trait double).
 */
export function shortened(points: Point[], end: 'start' | 'end' | null, by = 7): Point[] {
  const copy = points.map((point) => ({ ...point }));
  const last = copy.length - 1;
  if (last < 1) return copy;
  if (end === 'end' && distance(copy[last], copy[last - 1]) > by + 2) {
    copy[last] = toward(copy[last], copy[last - 1], by);
  }
  if (end === 'start' && distance(copy[0], copy[1]) > by + 2) {
    copy[0] = toward(copy[0], copy[1], by);
  }
  return copy;
}

/** Emplacements possibles du nom d'un lien : le milieu de ses segments, du plus long au plus court. */
export function labelSpots(points: Point[]): Point[] {
  const spots: (Point & { length: number })[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = distance(a, b);
    spots.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length });
    if (length > 170) {
      for (const t of [0.25, 0.75]) {
        spots.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, length: length * 0.8 });
      }
    }
  }
  return spots.sort((a, b) => b.length - a.length).map(({ x, y }) => ({ x, y }));
}

/**
 * Trait d'un lien sans sens (co-occurrence), posé après la disposition : une courbe sur le côté
 * (à droite ; dessous en lecture de haut en bas) quand les deux cartes sont dans la même colonne,
 * une courbe en S de l'une à l'autre sinon.
 */
export function sideCurve(a: Box, b: Box, horizontal = true): { path: string; middle: Point } {
  if (!horizontal) {
    // Même courbe, axes échangés : on la calcule couchée puis on la redresse.
    const flip = (box: Box): Box => ({ x: box.y, y: box.x, width: box.height, height: box.width });
    const lying = sideCurve(flip(a), flip(b));
    return {
      path: lying.path.replace(/(-?[\d.]+),(-?[\d.]+)/g, '$2,$1'),
      middle: { x: lying.middle.y, y: lying.middle.x },
    };
  }
  let start: Point;
  let end: Point;
  let c1: Point;
  let c2: Point;
  if (Math.abs(a.x - b.x) < 30) {
    start = { x: a.x + a.width, y: a.y + a.height / 2 };
    end = { x: b.x + b.width, y: b.y + b.height / 2 };
    const bulge = 26 + Math.min(40, distance(start, end) * 0.15);
    c1 = { x: start.x + bulge, y: start.y };
    c2 = { x: end.x + bulge, y: end.y };
  } else {
    const left = a.x < b.x ? a : b;
    const right = left === a ? b : a;
    start = { x: left.x + left.width, y: left.y + left.height / 2 };
    end = { x: right.x, y: right.y + right.height / 2 };
    const half = (end.x - start.x) / 2;
    c1 = { x: start.x + half, y: start.y };
    c2 = { x: end.x - half, y: end.y };
  }
  return {
    path: `M${at(start)} C${at(c1)} ${at(c2)} ${at(end)}`,
    middle: {
      x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
      y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
    },
  };
}
