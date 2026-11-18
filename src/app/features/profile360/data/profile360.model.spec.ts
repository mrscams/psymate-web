import { profileItem } from './profile360.fixtures';
import {
  categoryFromParam,
  countLabel,
  createBody,
  groupByCategory,
  initialOf,
  PROFILE_CATEGORIES,
  updateBody,
} from './profile360.model';

describe('profile360.model', () => {
  it('les quatre rubriques dans l’ordre du menu et de l’API', () => {
    expect(PROFILE_CATEGORIES).toEqual(['history', 'family', 'health', 'values_goals']);
  });

  it('?rubrique= : absente ou inconnue → history, sinon la rubrique demandée', () => {
    expect(categoryFromParam(null)).toBe('history');
    expect(categoryFromParam('')).toBe('history');
    expect(categoryFromParam('famille')).toBe('history');
    expect(categoryFromParam('family')).toBe('family');
    expect(categoryFromParam('values_goals')).toBe('values_goals');
  });

  it('groupByCategory garde l’ordre reçu dans chaque rubrique, sans retrier', () => {
    // Ordre volontairement non trié (année décroissante, titres non alphabétiques).
    const late = profileItem('history', 'Zèbre', { periodYear: 2020 });
    const early = profileItem('history', 'Abeille', { periodYear: 1990 });
    const family = profileItem('family', 'Thomas');
    const undated = profileItem('history', 'Sans année');
    const groups = groupByCategory([late, family, early, undated]);
    expect(groups.history).toEqual([late, early, undated]);
    expect(groups.family).toEqual([family]);
    expect(groups.health).toEqual([]);
    expect(groups.values_goals).toEqual([]);
  });

  it('initialOf : première lettre du titre, en capitale, guillemets ignorés', () => {
    expect(initialOf('Thomas, compagnon')).toBe('T');
    expect(initialOf('« hélène », sa mère')).toBe('H');
    expect(initialOf('élodie')).toBe('É');
    expect(initialOf('…')).toBe('…');
  });

  it('countLabel : « 1 information », « 6 informations »', () => {
    expect(countLabel(1)).toBe('1 information');
    expect(countLabel(6)).toBe('6 informations');
    expect(countLabel(0)).toBe('0 informations');
  });

  describe('corps des écritures (M13-07)', () => {
    const base = {
      category: 'history' as const,
      title: 'Enfance',
      detail: null,
      periodLabel: null,
      periodYear: null,
    };

    it('createBody : rien de vide ; période seulement pour history', () => {
      expect(createBody(base)).toEqual({ category: 'history', title: 'Enfance' });
      expect(
        createBody({ ...base, detail: 'Nantes', periodLabel: 'Enfance', periodYear: 1991 }),
      ).toEqual({
        category: 'history',
        title: 'Enfance',
        detail: 'Nantes',
        periodLabel: 'Enfance',
        periodYear: 1991,
      });
      expect(
        createBody({ ...base, category: 'family', periodLabel: 'X', periodYear: 2000 }),
      ).toEqual({
        category: 'family',
        title: 'Enfance',
      });
    });

    it('updateBody : champs modifiés seulement, null pour effacer ; en quittant history, période non envoyée', () => {
      const item = profileItem('history', 'Enfance', {
        detail: 'Nantes',
        periodLabel: '1991',
        periodYear: 1991,
      });
      const same = { ...base, detail: 'Nantes', periodLabel: '1991', periodYear: 1991 };
      expect(updateBody(item, same)).toEqual({});
      expect(updateBody(item, { ...same, detail: null, periodYear: null })).toEqual({
        detail: null,
        periodYear: null,
      });
      expect(
        updateBody(item, { ...same, category: 'family', periodLabel: null, periodYear: null }),
      ).toEqual({
        category: 'family',
      });
      const family = profileItem('family', 'Thomas');
      expect(
        updateBody(family, { ...base, title: 'Thomas', category: 'history', periodYear: 2020 }),
      ).toEqual({ category: 'history', periodYear: 2020 });
    });
  });
});
