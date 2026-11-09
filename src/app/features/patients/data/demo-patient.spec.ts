import { DEMO_PREFIX, isDemoPatient } from './patient.model';

describe('isDemoPatient (G Q22 : patient « DEMO · … » du seed)', () => {
  it.each([
    ['DEMO · Camille R.', true],
    [`${DEMO_PREFIX}Marie D.`, true],
    ['  DEMO ·Camille R.', true],
    ['DEMO•Camille', true],
    ['DEMO - Camille', true],
    ['Marie D.', false],
    ['SEED · Quentin S.', false],
    ['Démo Camille', false],
    ['demo · camille', false],
    ['DEMO · ', false],
    ['DEMOCRATE · Paul', false],
    ['Camille DEMO · R.', false],
  ])('%j → %s', (displayName, expected) => {
    expect(isDemoPatient({ displayName })).toBe(expected);
  });
});
