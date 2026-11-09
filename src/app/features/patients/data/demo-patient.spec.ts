import { DEMO_PREFIX, isDemoPatient } from './patient.model';

describe('isDemoPatient (G Q22 : préfixe exact « DEMO · » de l’outil de seed)', () => {
  it.each([
    ['DEMO · Camille R.', true],
    [`${DEMO_PREFIX}Marie D.`, true],
    ['DEMO · E2E 1794215381273', true],
    ['DEMO-Tristan', false],
    ['DEMO•Camille', false],
    ['DEMO ·Camille R.', false],
    ['  DEMO · Camille R.', false],
    ['Marie D.', false],
    ['SEED · Quentin S.', false],
    ['Démo · Camille', false],
    ['demo · camille', false],
    ['DEMO · ', false],
    ['DEMOCRATE · Paul', false],
    ['Camille DEMO · R.', false],
  ])('%j → %s', (displayName, expected) => {
    expect(isDemoPatient({ displayName })).toBe(expected);
  });
});
