import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('vide → 0, moins de 12 caractères → 1 (jamais plus d’une barre)', () => {
    expect(passwordStrength('').level).toBe(0);
    expect(passwordStrength('Abc1!').level).toBe(1);
    expect(passwordStrength('Aa1!Aa1!Aa1').level).toBe(1);
  });

  it('12 caractères d’une seule classe → faible', () => {
    expect(passwordStrength('motdepasse1234')).toEqual({ level: 2, length: 14 });
  });

  it('variété et longueur → bon puis fort', () => {
    expect(passwordStrength('FilRouge2026ab').level).toBe(3);
    expect(passwordStrength('Vendôme-Lyon-2026!x').level).toBe(4);
  });

  it('répétitions longues ne montent pas au-dessus de faible', () => {
    expect(passwordStrength('Aaaaaaaaaaaa1!').level).toBe(2);
  });
});
