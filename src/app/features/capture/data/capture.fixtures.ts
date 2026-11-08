// Données de test de features/capture : vocabulaire (celui de la table du parseur, avec familles),
// catalogue des types de liens (E5.3) et cibles du rail. Aucune donnée réelle.

import { EmotionFamily, LinkCandidate } from '../../entries';
import { LinkTypeOption } from '../../graph';
import { CASE_EMOTIONS } from '../parser/parse.cases';
import { CaptureEmotion } from './capture.model';

/** Familles E5.2 des émotions de la table du parseur (les personnalisées : tristesse, peur, colère). */
const FAMILIES: Record<string, EmotionFamily> = {
  serenity: 'joy',
  joy: 'joy',
  ecstasy: 'joy',
  acceptance: 'trust',
  trust: 'trust',
  admiration: 'trust',
  apprehension: 'fear',
  fear: 'fear',
  terror: 'fear',
  distraction: 'surprise',
  surprise: 'surprise',
  amazement: 'surprise',
  pensiveness: 'sadness',
  sadness: 'sadness',
  grief: 'sadness',
  boredom: 'disgust',
  disgust: 'disgust',
  loathing: 'disgust',
  annoyance: 'anger',
  anger: 'anger',
  rage: 'anger',
  interest: 'anticipation',
  anticipation: 'anticipation',
  vigilance: 'anticipation',
  anxiety: 'fear',
  guilt: 'sadness',
  shame: 'sadness',
  emptiness: 'sadness',
  calm: 'trust',
  c_1a2b3c4d: 'sadness',
  c_5e6f7a8b: 'sadness',
  c_9c0d1e2f: 'anger',
};

/** Le vocabulaire de parse.cases.ts, tel que CaptureApi le rend (libellé français affiché). */
export const EMOTIONS: CaptureEmotion[] = CASE_EMOTIONS.map((emotion) => ({
  code: emotion.code,
  labelFr: emotion.labelFr,
  labelEn: emotion.labelEn ?? null,
  label: emotion.labelFr,
  family: FAMILIES[emotion.code] ?? null,
  custom: emotion.code.startsWith('c_'),
}));

export const LINK_TYPES: LinkTypeOption[] = [
  {
    code: 'triggers',
    directed: true,
    label: 'déclenche',
    inverseLabel: 'déclenché par',
    sources: ['event', 'situation', 'session'],
    targets: ['feeling', 'situation', 'event'],
    lineStyle: 'solid',
  },
  {
    code: 'caused_by',
    directed: true,
    label: 'est causé par',
    inverseLabel: 'cause',
    sources: ['feeling', 'situation', 'event'],
    targets: ['event', 'situation'],
    lineStyle: 'solid',
  },
  {
    code: 'co_occurs',
    directed: false,
    label: 'survient avec',
    inverseLabel: null,
    sources: ['note', 'event', 'situation', 'feeling', 'medication'],
    targets: ['note', 'event', 'situation', 'feeling', 'medication'],
    lineStyle: 'dotted',
  },
  {
    code: 'treats',
    directed: true,
    label: 'traite',
    inverseLabel: 'traité par',
    sources: ['medication'],
    targets: ['situation', 'feeling'],
    lineStyle: 'double',
  },
];

export function candidate(overrides: Partial<LinkCandidate> = {}): LinkCandidate {
  return {
    id: 'e-event',
    type: 'event',
    title: 'Entretien annuel',
    emotionCode: null,
    intensity: null,
    occurred: { from: '2026-11-10T00:00:00Z', to: null, precision: 'day', label: null },
    ongoing: false,
    ...overrides,
  };
}

/** Le rail : une situation en cours, l'événement « Entretien annuel », une note. */
export const CANDIDATES: LinkCandidate[] = [
  candidate({
    id: 'e-situation',
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: { from: '2026-03-01T00:00:00Z', to: null, precision: 'month', label: null },
    ongoing: true,
  }),
  candidate(),
  candidate({ id: 'e-note', type: 'note', title: 'Dort mal depuis deux semaines' }),
];
