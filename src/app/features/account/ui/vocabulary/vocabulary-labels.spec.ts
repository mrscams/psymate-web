import { EMOTIONS } from '../../data/vocabulary.fixtures';
import {
  closestEmotion,
  familyLabel,
  normalizeLabel,
  trigramSimilarity,
} from './vocabulary-labels';
import {
  emotionProblemMessage,
  tagProblemMessage,
  undoProblemMessage,
} from './vocabulary-messages';

describe('vocabulary-labels', () => {
  it.each([
    ['Appréhension sociale', 'Appréhension'],
    ['anxiete', 'Anxiété'],
    ['Anxietes', 'Anxiété'],
    ['#Tristesse ', 'Tristesse'],
    ['Lassitudes', 'Lassitude'],
    ['Émerveillement', null],
    ['Jo', null],
    ['Ennui', null],
    // UX-C4 : dès 3 lettres, un début de mot suffit.
    ['Anx', 'Anxiété'],
    ['tri', 'Tristesse'],
    ['Appr', 'Appréhension'],
    ['Las', 'Lassitude'],
    ['Xyz', null],
  ])('closestEmotion(%s) → %s', (label, expected) => {
    expect(closestEmotion(label, EMOTIONS)?.labelFr ?? null).toBe(expected);
  });

  it('normalizeLabel : casse, accents, « # », espaces', () => {
    expect(normalizeLabel('  #Appréhension   SOCIALE ')).toBe('apprehension sociale');
  });

  it('trigramSimilarity : 1 pour identiques, 0 pour disjoints', () => {
    expect(trigramSimilarity('joie', 'joie')).toBe(1);
    expect(trigramSimilarity('abc', 'xyz')).toBe(0);
  });

  it('familyLabel : les huit familles ont un nom', () => {
    expect(familyLabel('anticipation')).toBe('Anticipation');
    expect(familyLabel('disgust')).toBe('Dégoût');
  });
});

describe('vocabulary-messages', () => {
  it.each([
    [{ status: 409, code: 'EMOTION_LABEL_EXISTS' }, 'existe déjà'],
    [{ status: 409, code: 'EMOTION_INACTIVE' }, 'déjà été fusionnée'],
    [{ status: 404, code: 'EMOTION_NOT_FOUND' }, 'introuvable'],
    [
      {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'labelFr', code: 'REQUIRED', message: 'Obligatoire.' }],
      },
      'Obligatoire.',
    ],
    [{ status: 0, code: 'NETWORK_ERROR' }, 'Vérifiez la connexion'],
  ])('emotionProblemMessage %#', (problem, text) => {
    expect(emotionProblemMessage(problem)).toContain(text);
  });

  it.each([
    [{ status: 409, code: 'MERGE_UNDO_EXPIRED' }, '30 jours'],
    [{ status: 409, code: 'MERGE_ALREADY_UNDONE' }, 'déjà été annulée'],
    [{ status: 404, code: 'MERGE_NOT_FOUND' }, 'retirée du journal'],
  ])('undoProblemMessage %#', (problem, text) => {
    expect(undoProblemMessage(problem)).toContain(text);
  });

  it('tagProblemMessage : TAG_IS_EMOTION propose l’émotion de l’API', () => {
    const problem = {
      status: 422,
      code: 'TAG_IS_EMOTION',
      extra: { suggestedEmotion: { code: 'anxiety', labelFr: 'Anxiété' } },
    };
    expect(tagProblemMessage(problem)).toContain("utiliser l'émotion Anxiété ?");
    expect(tagProblemMessage({ status: 422, code: 'TAG_IS_EMOTION' })).toContain(
      'déjà une émotion',
    );
    expect(tagProblemMessage({ status: 409, code: 'TAG_EXISTS' })).toContain('porte déjà');
  });
});
