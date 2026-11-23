import { mostLinkedSituation, toEmotionLabels, toView } from './graph.api';

describe('GraphApi · toEmotionLabels (Q78, plus de booléen english)', () => {
  const list = [
    { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
    { code: 'shame', labelFr: 'Honte' },
    { code: 'calm', labelFr: '', labelEn: '' },
    { labelFr: 'Sans code' },
  ];

  it('français : le libellé français, sinon le code', () => {
    expect(toEmotionLabels(list, 'fr')).toEqual({
      anxiety: 'Anxiété',
      shame: 'Honte',
      calm: 'calm',
    });
  });

  it('anglais : le libellé anglais, sinon le français', () => {
    expect(toEmotionLabels(list, 'en')).toEqual({
      anxiety: 'Anxiety',
      shame: 'Honte',
      calm: 'calm',
    });
  });

  it('arabe : le français tant que le catalogue n’a pas de libellé arabe (contrat 0.16.0)', () => {
    expect(toEmotionLabels(list, 'ar')).toEqual({
      anxiety: 'Anxiété',
      shame: 'Honte',
      calm: 'calm',
    });
  });
});

describe('GraphApi · toEmotionLabels, libellé arabe du catalogue (M16-25, contrat 0.16.0)', () => {
  const list = [
    { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'قلق' },
    { code: 'joy', labelFr: 'Joie', labelEn: 'Joy', labelAr: '' },
    { code: 'shame', labelFr: 'Honte', labelEn: 'Shame' },
  ];

  it('arabe : labelAr s’il existe ; vide ou absent, le français, jamais l’anglais', () => {
    expect(toEmotionLabels(list, 'ar')).toEqual({ anxiety: 'قلق', joy: 'Joie', shame: 'Honte' });
  });

  it('français et anglais inchangés par la présence d’un libellé arabe', () => {
    expect(toEmotionLabels(list, 'fr')).toEqual({
      anxiety: 'Anxiété',
      joy: 'Joie',
      shame: 'Honte',
    });
    expect(toEmotionLabels(list, 'en')).toEqual({ anxiety: 'Anxiety', joy: 'Joy', shame: 'Shame' });
  });
});

describe('GraphApi · mostLinkedSituation (racine par défaut)', () => {
  it('la situation en cours la plus liée (triées par le serveur), reliée au moins une fois', () => {
    expect(
      mostLinkedSituation([
        { linkCount: 30 },
        { entryId: 'e-1', linkCount: 21 },
        { entryId: 'e-2', linkCount: 4 },
        { entryId: 'e-sans-lien', linkCount: 0 },
      ]),
    ).toBe('e-1');
  });

  it('aucune situation en cours reliée : null (tout le dossier)', () => {
    expect(mostLinkedSituation([{ entryId: 'e-1', linkCount: 0 }])).toBeNull();
    expect(mostLinkedSituation(undefined)).toBeNull();
  });
});

describe('GraphApi · toView', () => {
  it('nœuds, arêtes, super-nœuds ; authorType gardé en lecture seule (practitioner par défaut)', () => {
    const view = toView({
      nodes: [
        { id: 'e-1', type: 'feeling', intensity: 8, emotion: 'anxiety', degree: 2, distance: 0 },
        { id: 'e-2', type: 'bogus', title: '  ', authorType: 'practitioner' as never },
        { type: 'note' },
      ],
      edges: [{ id: 'l-1', source: 'e-1', target: 'e-2', linkType: 'triggers' }],
      superNodes: [
        { id: 'sn:e-1:feeling', type: 'feeling', memberIds: ['a', 'b'], neighborId: 'e-1' },
      ],
      truncated: true,
    });
    expect(view.nodes).toHaveLength(2);
    expect(view.nodes[0]).toMatchObject({
      type: 'feeling',
      authorType: 'practitioner',
      title: null,
    });
    expect(view.nodes[1]).toMatchObject({ type: 'note', authorType: 'practitioner', title: null });
    expect(view.edges[0]).toMatchObject({
      directed: true,
      provenance: 'manual',
      status: 'accepted',
    });
    expect(view.superNodes[0]).toMatchObject({ count: 2, dominantEmotion: null });
    expect(view.truncated).toBe(true);
  });
});
