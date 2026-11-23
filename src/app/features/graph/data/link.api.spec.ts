import { toLinkType } from './link.api';

/** Vue du catalogue telle que le serveur la rend (LinkTypeView). */
type View = Parameters<typeof toLinkType>[0];

describe('LinkApi · toLinkType (Q78, plus de booléen english)', () => {
  const view = {
    code: 'triggers',
    directed: true,
    labelFr: 'déclenche',
    labelEn: 'triggers',
    inverseLabelFr: 'déclenché par',
    inverseLabelEn: 'triggered by',
    allowedSourceTypes: ['event', 'bogus'],
    allowedTargetTypes: ['feeling'],
    lineStyle: 'solid',
  } as View;

  it('français : verbes du catalogue en français', () => {
    expect(toLinkType(view, 'fr')).toEqual({
      code: 'triggers',
      directed: true,
      label: 'déclenche',
      inverseLabel: 'déclenché par',
      sources: ['event'],
      targets: ['feeling'],
      lineStyle: 'solid',
    });
  });

  it('anglais : verbes anglais, sinon français', () => {
    expect(toLinkType(view, 'en')).toMatchObject({
      label: 'triggers',
      inverseLabel: 'triggered by',
    });
    expect(
      toLinkType({ ...view, labelEn: undefined, inverseLabelEn: undefined }, 'en'),
    ).toMatchObject({ label: 'déclenche', inverseLabel: 'déclenché par' });
  });

  it('arabe : le français tant que le catalogue n’a pas de libellé arabe (contrat 0.16.0)', () => {
    expect(toLinkType(view, 'ar')).toMatchObject({
      label: 'déclenche',
      inverseLabel: 'déclenché par',
    });
  });

  it('sans verbe inverse (lien symétrique) : null ; sans libellé : le code', () => {
    const symmetric = {
      code: 'co_occurs',
      directed: false,
      allowedSourceTypes: [],
      allowedTargetTypes: [],
    } as View;
    expect(toLinkType(symmetric, 'fr')).toMatchObject({
      label: 'co_occurs',
      inverseLabel: null,
      directed: false,
    });
    expect(toLinkType(symmetric, 'en')).toMatchObject({ label: 'co_occurs', inverseLabel: null });
  });
});
