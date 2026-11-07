import { CENTERED, cropSquare, outputSide, PHOTO_SIZE } from './crop';
import { initialsOf } from './profile-labels';

describe('recadrage carré', () => {
  it('centré : le plus grand carré au milieu d’une photo paysage ou portrait', () => {
    expect(cropSquare(4000, 3000, CENTERED)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(cropSquare(3000, 4000, CENTERED)).toEqual({ sx: 0, sy: 500, side: 3000 });
  });

  it('zoom et position : carré plus petit, déplacé dans les bornes', () => {
    expect(cropSquare(4000, 3000, { zoom: 2, x: 0, y: 1 })).toEqual({
      sx: 0,
      sy: 1500,
      side: 1500,
    });
    // Valeurs hors bornes ramenées à l'image ; zoom < 1 traité comme 1.
    expect(cropSquare(1000, 1000, { zoom: 0.5, x: 2, y: -1 })).toEqual({
      sx: 0,
      sy: 0,
      side: 1000,
    });
  });

  it('sortie 512 px au plus, jamais agrandie', () => {
    expect(PHOTO_SIZE).toBe(512);
    expect(outputSide(3000)).toBe(512);
    expect(outputSide(300)).toBe(300);
  });
});

describe('initialsOf', () => {
  it('prénom et nom, titres ignorés', () => {
    expect(initialsOf('Claire Martin')).toBe('CM');
    expect(initialsOf('Dr Karim Haddad')).toBe('KH');
    expect(initialsOf('Élise')).toBe('É');
    expect(initialsOf('  ')).toBe('?');
  });
});
