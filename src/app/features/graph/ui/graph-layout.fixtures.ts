// Moteur de disposition des tests (Vitest seulement) : le vrai elkjs, sans import dynamique, pour
// que la disposition soit prête en quelques tours de boucle.
import ELK from 'elkjs/lib/elk.bundled.js';

import { GRAPH_LAYOUT_ENGINE, LayoutEngine } from './graph-layout';

export function testEngine(): LayoutEngine {
  return new ELK();
}

export function provideTestLayout() {
  return { provide: GRAPH_LAYOUT_ENGINE, useValue: () => Promise.resolve(testEngine()) };
}
