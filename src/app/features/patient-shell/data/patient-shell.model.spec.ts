import { elapsedMinutes, inGrace, overtimeMinutes, proposedDuration } from './patient-shell.model';

// Calculs purs de l'onglet Séance et du panneau de clôture (UX-S3, proposition 04b).

const start = '2026-11-12T08:08:00Z';
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000);

describe('elapsedMinutes / overtimeMinutes', () => {
  it('minutes entières écoulées, jamais négatives ; dépassement au-delà de la durée prévue', () => {
    expect(elapsedMinutes(start, at(12.9))).toBe(12);
    expect(elapsedMinutes(start, at(-5))).toBe(0);
    expect(elapsedMinutes('pas une date', at(10))).toBe(0);
    expect(overtimeMinutes(48, 50)).toBe(0);
    expect(overtimeMinutes(50, 50)).toBe(0);
    expect(overtimeMinutes(58, 50)).toBe(8);
  });
});

describe('proposedDuration', () => {
  it('le temps écoulé arrondi à 5 min, au moins 1', () => {
    expect(proposedDuration(48, 50, 180)).toBe(50);
    expect(proposedDuration(47, 50, 180)).toBe(45);
    expect(proposedDuration(1, 50, 180)).toBe(1);
    expect(proposedDuration(0, 50, 180)).toBe(1);
    expect(proposedDuration(2, 50, 180)).toBe(1);
    expect(proposedDuration(3, 50, 180)).toBe(5);
  });

  it('passé le seuil « non clôturée » (3 h) : la durée prévue, bornée par le contrat', () => {
    expect(proposedDuration(181, 50, 180)).toBe(50);
    expect(proposedDuration(180, 50, 180)).toBe(180);
    expect(proposedDuration(700, 50, 180)).toBe(50);
    expect(proposedDuration(700, 900, 180)).toBe(600);
  });
});

describe('inGrace', () => {
  it('moins de 75 min après l’enregistrement : « modifier » ; après : « corriger »', () => {
    expect(inGrace(start, at(74))).toBe(true);
    expect(inGrace(start, at(75))).toBe(false);
    expect(inGrace(null, at(1))).toBe(false);
    expect(inGrace('n/a', at(1))).toBe(false);
  });
});
