import { toEmotion, toLinkType } from './capture.api';

/** Vues du catalogue telles que le serveur les rend (EmotionView, LinkTypeView). */
type EmotionView = Parameters<typeof toEmotion>[0];
type LinkTypeView = Parameters<typeof toLinkType>[0];

/** M16-25 : libellés arabes du catalogue (contrat 0.16.0), choisis par catalogLabel (Q78). */
describe('CaptureApi · libellés arabes du catalogue (M16-25)', () => {
  const anxiety = {
    code: 'anxiety',
    family: 'fear',
    labelFr: 'Anxiété',
    labelEn: 'Anxiety',
    labelAr: 'قلق',
  } as EmotionView;
  const joy = { code: 'joy', family: 'joy', labelFr: 'Joie', labelEn: 'Joy' } as EmotionView;
  const shame = { code: 'shame', labelFr: 'Honte', labelEn: 'Shame', labelAr: '' } as EmotionView;

  it('émotion : le modèle porte labelAr ; en arabe, labelAr s’il existe, sinon le français', () => {
    expect(toEmotion(anxiety, 'ar')).toMatchObject({ labelAr: 'قلق', label: 'قلق' });
    expect(toEmotion(joy, 'ar')).toMatchObject({ labelAr: null, label: 'Joie' });
    expect(toEmotion(shame, 'ar')).toMatchObject({ label: 'Honte' });
  });

  it('émotion : français et anglais inchangés par la présence d’un libellé arabe', () => {
    expect(toEmotion(anxiety, 'fr').label).toBe('Anxiété');
    expect(toEmotion(anxiety, 'en').label).toBe('Anxiety');
    expect(toEmotion(joy, 'fr').label).toBe('Joie');
    expect(toEmotion(joy, 'en').label).toBe('Joy');
  });

  const triggers = {
    code: 'triggers',
    labelFr: 'déclenche',
    labelEn: 'triggers',
    labelAr: 'يُثير',
    inverseLabelFr: 'déclenché par',
    inverseLabelEn: 'triggered by',
    inverseLabelAr: 'يُثيره',
  } as LinkTypeView;

  it('type de lien : labelAr et inverseLabelAr en arabe ; vides, le français', () => {
    expect(toLinkType(triggers, 'ar')).toMatchObject({ label: 'يُثير', inverseLabel: 'يُثيره' });
    expect(toLinkType({ ...triggers, labelAr: '', inverseLabelAr: '' }, 'ar')).toMatchObject({
      label: 'déclenche',
      inverseLabel: 'déclenché par',
    });
  });

  it('type de lien : français et anglais inchangés', () => {
    expect(toLinkType(triggers, 'fr')).toMatchObject({
      label: 'déclenche',
      inverseLabel: 'déclenché par',
    });
    expect(toLinkType(triggers, 'en')).toMatchObject({
      label: 'triggers',
      inverseLabel: 'triggered by',
    });
  });
});
