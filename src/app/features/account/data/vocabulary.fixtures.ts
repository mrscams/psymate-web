import { SessionUser } from '../../../core/auth';
import { Emotion, EmotionMerge } from './emotions.api';
import { Tag } from './tags.api';

/** Jeu de données des specs du vocabulaire (stores, composants, pages). */
export const CLAIRE: SessionUser = {
  id: 'u-claire',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

export const SADNESS: Emotion = {
  code: 'sadness',
  scope: 'global',
  family: 'sadness',
  labelFr: 'Tristesse',
  labelEn: 'Sadness',
};
export const ANXIETY: Emotion = {
  code: 'anxiety',
  scope: 'global',
  family: 'fear',
  labelFr: 'Anxiété',
  labelEn: 'Anxiety',
};
export const APPREHENSION: Emotion = {
  code: 'apprehension',
  scope: 'global',
  family: 'fear',
  labelFr: 'Appréhension',
  labelEn: 'Apprehension',
};
export const JOY: Emotion = {
  code: 'joy',
  scope: 'global',
  family: 'joy',
  labelFr: 'Joie',
  labelEn: 'Joy',
};
export const LASSITUDE: Emotion = {
  code: 'c_0000aaaa',
  scope: 'custom',
  family: 'sadness',
  labelFr: 'Lassitude',
  labelEn: null,
};
export const MOROSITE: Emotion = {
  code: 'c_0000bbbb',
  scope: 'custom',
  family: 'sadness',
  labelFr: 'Morosité',
  labelEn: null,
};

export const EMOTIONS: Emotion[] = [SADNESS, ANXIETY, APPREHENSION, JOY, LASSITUDE, MOROSITE];

export const MERGE: EmotionMerge = {
  id: 'm-1',
  sourceCode: LASSITUDE.code,
  targetCode: MOROSITE.code,
  affectedCount: 3,
  mergedAt: '2026-11-08T09:00:00Z',
  undoUntil: '2026-12-08T09:00:00Z',
  undoneAt: null,
};

export const TRAVAIL: Tag = {
  id: 't-travail',
  label: 'travail',
  normalizedLabel: 'travail',
  usageCount: 4,
  createdAt: '2026-11-01T10:00:00Z',
};
export const BOULOT: Tag = {
  id: 't-boulot',
  label: 'boulot',
  normalizedLabel: 'boulot',
  usageCount: 2,
  createdAt: '2026-11-02T10:00:00Z',
};
export const SANTE: Tag = {
  id: 't-sante',
  label: 'santé',
  normalizedLabel: 'sante',
  usageCount: 1,
  createdAt: '2026-11-03T10:00:00Z',
};

export const TAGS: Tag[] = [BOULOT, SANTE, TRAVAIL];

/** 422 TAG_IS_EMOTION tel que l'API le renvoie (suggestedEmotion dans extra après l'intercepteur). */
export const TAG_IS_EMOTION = {
  status: 422,
  code: 'TAG_IS_EMOTION',
  errors: [
    { field: 'label', code: 'TAG_IS_EMOTION', message: 'Ce libellé correspond à une émotion.' },
  ],
  extra: { suggestedEmotion: { code: 'anxiety', labelFr: 'Anxiété', scope: 'global' } },
};
