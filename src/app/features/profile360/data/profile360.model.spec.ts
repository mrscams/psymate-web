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
    expect(initialOf('Thomas, compagnon', 'fr')).toBe('T');
    expect(initialOf('« hélène », sa mère', 'fr')).toBe('H');
    expect(initialOf('élodie', 'fr')).toBe('É');
    expect(initialOf('…', 'fr')).toBe('…');
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

// M16-22 (docs/design/arabe.md §4, G Q73, Q76) : la lettre de la pastille de Famille est découpée
// par graphème ; une lettre arabe n'est pas mise en capitale ; un titre latin rend la même lettre
// qu'avant, dans les trois langues.
describe('initialOf, version arabe (M16-22)', () => {
  it('titre latin : la même lettre qu’avant, dans chaque locale de formatage', () => {
    for (const locale of ['fr', 'en', 'ar', 'ar-u-ca-gregory-hc-h23-nu-latn']) {
      expect(initialOf('Thomas, compagnon', locale)).toBe('T');
      expect(initialOf('« hélène », sa mère', locale)).toBe('H');
      expect(initialOf('élodie', locale)).toBe('É');
      expect(initialOf('  ïsis', locale)).toBe('Ï');
      expect(initialOf('2e enfant', locale)).toBe('2');
      expect(initialOf('…', locale)).toBe('…');
    }
  });

  it('titre qui commence par un émoji : la première lettre, comme avant ; un émoji seul reste entier', () => {
    expect(initialOf('🙂 Thomas', 'fr')).toBe('T');
    expect(initialOf('👨‍👩‍👧 Famille Martin', 'fr')).toBe('F');
    // Avant : la moitié d'une paire de substitution (charAt). Le graphème entier, désormais.
    expect(initialOf('👨‍👩‍👧', 'fr')).toBe('👨‍👩‍👧');
    expect(initialOf('🇫🇷', 'ar')).toBe('🇫🇷');
  });

  it('lettre accentuée décomposée : la lettre garde son accent', () => {
    expect(initialOf('élodie', 'fr')).toBe('É');
  });

  it('titre arabe : la première lettre arabe, avec ses marques, sans capitale, dans les trois langues', () => {
    expect(initialOf('سلمى، أخته', 'ar')).toBe('س');
    expect(initialOf('مُحَمَّد، والده', 'ar')).toBe('مُ');
    expect(initialOf('« ليلى »، أمه', 'fr')).toBe('ل');
    expect(initialOf('لا أحد', 'en')).toBe('ل');
  });

  it('sans Intl.Segmenter : le repli découpe aussi par graphème', () => {
    const segmenter = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
      expect(initialOf('مُحَمَّد', 'ar')).toBe('مُ');
      expect(initialOf('élodie', 'fr')).toBe('É');
      expect(initialOf('👨‍👩‍👧', 'fr')).toBe('👨‍👩‍👧');
      expect(initialOf('Thomas', 'fr')).toBe('T');
    } finally {
      Object.defineProperty(Intl, 'Segmenter', { value: segmenter, configurable: true });
    }
  });
});
