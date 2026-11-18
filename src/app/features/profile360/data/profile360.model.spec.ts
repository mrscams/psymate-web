import { profileItem } from './profile360.fixtures';
import {
  categoryFromParam,
  countLabel,
  groupByCategory,
  initialOf,
  PROFILE_CATEGORIES,
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
});
