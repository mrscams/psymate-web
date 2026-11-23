import { entryTypeLabel } from '../../../shared/ui';
import { CATALOG } from '../data/link.fixtures';
import { listText, refusalText } from './link-labels';

describe('link-labels · listes dans la langue de l’interface (M16-18)', () => {
  const items = ['déclenche', 'aggrave', 'soulage'];

  it.each(['fr', 'en'])(
    '/%s/ : même rendu que l’ancien join(", ") (une, deux, trois valeurs)',
    (locale) => {
      for (const list of [items.slice(0, 1), items.slice(0, 2), items]) {
        expect(listText(list, locale)).toBe(list.join(', '));
      }
    },
  );

  it('/ar/ : liste arabe, sans virgule latine', () => {
    const text = listText(items, 'ar');
    expect(text).not.toContain(', ');
    expect(text).toContain('و');
    for (const item of items) expect(text).toContain(item);
  });

  it('aide d’une puce refusée : la phrase française ne change pas', () => {
    const treats = CATALOG.find((type) => type.code === 'treats')!;
    const sources = treats.sources.map((type) => entryTypeLabel(type).toLowerCase()).join(', ');
    const targets = treats.targets.map((type) => entryTypeLabel(type).toLowerCase()).join(', ');
    expect(refusalText(treats, { source: true, target: true, reversible: false }, 'fr')).toBe(
      `« ${treats.label} » : seulement de ${sources} vers ${targets}.`,
    );
  });

  it('aide d’une puce refusée en arabe : les types sont listés à l’arabe', () => {
    const relieves = CATALOG.find((type) => type.code === 'relieves')!;
    const text = refusalText(relieves, { source: true, target: false, reversible: false }, 'ar');
    expect(text).not.toMatch(/[^ ], [^ ]/);
    expect(text).toContain('و');
  });
});
