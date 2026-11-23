import { catalogLabel } from './catalog-label';

describe('catalogLabel (Q78)', () => {
  const full = { labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'القلق' };
  const frOnly = { labelFr: 'Anxiété' };

  it('arabe s’il existe, sinon français', () => {
    expect(catalogLabel(full, 'ar')).toBe('القلق');
    expect(catalogLabel(frOnly, 'ar')).toBe('Anxiété');
    expect(catalogLabel({ ...full, labelAr: null }, 'ar')).toBe('Anxiété');
    expect(catalogLabel({ ...full, labelAr: '' }, 'ar')).toBe('Anxiété');
  });

  it('anglais s’il existe, sinon français ; jamais l’arabe hors du bundle arabe', () => {
    expect(catalogLabel(full, 'en')).toBe('Anxiety');
    expect(catalogLabel(frOnly, 'en')).toBe('Anxiété');
    expect(catalogLabel({ labelFr: 'Anxiété', labelAr: 'القلق' }, 'en')).toBe('Anxiété');
    expect(catalogLabel({ ...full, labelEn: null }, 'en')).toBe('Anxiété');
  });

  it('français en français', () => {
    expect(catalogLabel(full, 'fr')).toBe('Anxiété');
  });
});
