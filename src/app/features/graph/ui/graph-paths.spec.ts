import { labelSpots, roundedPath, shortened, sideCurve } from './graph-paths';

describe('graph-paths', () => {
  const elbow = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
  ];

  it('roundedPath : passe par les points, angles arrondis', () => {
    expect(roundedPath(elbow)).toBe('M0,0 L90,0 Q100,0 100,10 L100,80');
    expect(roundedPath([elbow[0]])).toBe('');
  });

  it('shortened : le trait s’arrête sous la pointe, du côté de la flèche seulement', () => {
    expect(shortened(elbow, 'end').at(-1)).toEqual({ x: 100, y: 73 });
    expect(shortened(elbow, 'start')[0]).toEqual({ x: 7, y: 0 });
    expect(shortened(elbow, null)).toEqual(elbow);
    // Segment trop court pour être raccourci.
    const short = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ];
    expect(shortened(short, 'end')).toEqual(short);
  });

  it('labelSpots : le milieu du segment le plus long d’abord', () => {
    expect(labelSpots(elbow)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 40 },
    ]);
  });

  it('sideCurve : sur le côté droit dans une même colonne, en S d’une colonne à l’autre', () => {
    const a = { x: 0, y: 0, width: 200, height: 50 };
    const below = { x: 0, y: 100, width: 200, height: 50 };
    const right = { x: 400, y: 100, width: 200, height: 50 };
    const side = sideCurve(a, below);
    expect(side.path.startsWith('M200,25 C')).toBe(true);
    expect(side.path.endsWith(' 200,125')).toBe(true);
    expect(side.middle.x).toBeGreaterThan(200);
    const across = sideCurve(right, a);
    expect(across.path.startsWith('M200,25 C')).toBe(true);
    expect(across.path.endsWith(' 400,125')).toBe(true);
  });
});
