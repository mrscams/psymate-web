// Modèle de vue de la vue d'ensemble (fiche 02, B4 écran 2, B8) : la réponse de
// GET /api/patients/{id}/overview, normalisée (listes jamais nulles, champs absents → null). Aucun
// calcul clinique ici : la projection est calculée par le serveur ; le web ne fait que la présenter.
// Aucun texte ici (les libellés sont dans ui/overview-labels.ts).
import { EntryType } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';

/** Fenêtre de la tendance, des émotions dominantes et des ressentis (préférence overview.window). */
export type OverviewWindow = '30d' | '90d' | '12m';

export const OVERVIEW_WINDOWS: readonly OverviewWindow[] = ['30d', '90d', '12m'];

/** Niveau de détail (préférence overview.view) : simple = récit (M4-07), complete = chiffres. */
export type OverviewMode = 'simple' | 'complete';

/** Les huit familles d'émotions (étude couleurs §4), une couleur chacune (--emotion-*). */
export type EmotionFamily =
  'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';

export const EMOTION_FAMILIES: readonly EmotionFamily[] = [
  'joy',
  'trust',
  'fear',
  'surprise',
  'sadness',
  'disgust',
  'anger',
  'anticipation',
];

export type FlagKind = 'watch' | 'risk' | 'shared_care';
export type SessionKind = 'intake' | 'session' | 'contact';
export type SessionModality = 'in_person' | 'video' | 'phone' | 'email';

/** Drapeau actif posé à la main sur le dossier. */
export interface OverviewFlag {
  kind: FlagKind;
  reason: string | null;
  setAt: string | null;
}

/** Médicament en cours (fin ni connue ni passée). */
export interface OverviewMedication {
  entryId: string;
  molecule: string;
  dosage: string | null;
  frequency: string | null;
  prescriber: string | null;
  /** Début de la prise AAAA-MM-JJ, sinon null. */
  periodFrom: string | null;
  /** Début de l'entrée (occurred_from), UTC ISO 8601. */
  since: string | null;
}

/** Faits clés, indépendants de la fenêtre. */
export interface OverviewFacts {
  age: number | null;
  followedSince: string | null;
  sessionCount: number;
  flags: OverviewFlag[];
  medications: OverviewMedication[];
}

/** Situation en cours, avec ses métriques (liens, ressentis liés, intensité moyenne). */
export interface ActiveSituation {
  entryId: string;
  title: string | null;
  since: string | null;
  linkCount: number;
  linkedFeelingCount: number;
  /** Moyenne serveur (0 à 10) des ressentis liés ; null s'il n'y en a aucun. */
  averageIntensity: number | null;
}

/** Point de la courbe : moyenne glissante sur 7 jours à cette date (calculée par le serveur). */
export interface TrendPoint {
  date: string;
  average: number | null;
}

/** Repère : séance, ou début / fin de médicament. */
export interface TrendMarker {
  entryId: string;
  date: string;
  kind: 'session' | 'medication';
  change: 'start' | 'end' | null;
  label: string | null;
  sessionKind: SessionKind | null;
}

/** Un ressenti réel de la fenêtre. */
export interface FeelingPoint {
  entryId: string;
  /** Jour UTC de placement, AAAA-MM-JJ. */
  date: string;
  emotionCode: string;
  family: EmotionFamily | null;
  intensity: number;
  sessionId: string | null;
}

/** Une émotion présente dans la fenêtre (libellé dans la langue de l'interface). */
export interface FeelingSeries {
  emotionCode: string;
  family: EmotionFamily | null;
  label: string;
  count: number;
}

export interface OverviewTrend {
  points: TrendPoint[];
  markers: TrendMarker[];
}

export interface OverviewFeelings {
  points: FeelingPoint[];
  series: FeelingSeries[];
  /** Repères de médicament de la fenêtre. */
  markers: TrendMarker[];
  /** Jours UTC des séances de la fenêtre. */
  ticks: string[];
}

/** Émotion dominante et variation par rapport à la fenêtre précédente (calculée par le serveur). */
export interface TopEmotion {
  code: string;
  label: string;
  count: number;
  previousCount: number;
  delta: number;
}

export interface OverviewDrafts {
  count: number;
  openSession: { entryId: string; startedAt: string | null } | null;
}

/** Séance récente ; seule la plus récente porte le compte rendu entier. */
export interface RecentSession {
  entryId: string;
  occurredFrom: string | null;
  closedAt: string | null;
  durationMin: number | null;
  entryCount: number;
  kind: SessionKind;
  modality: SessionModality | null;
  title: string | null;
  summary: string | null;
  summaryFirstLine: string | null;
}

/** Entrée récente du dossier (lue en direct par le serveur). */
export interface ActivityItem {
  entryId: string;
  type: EntryType;
  title: string | null;
  status: 'draft' | 'final';
  visibility: 'private' | 'clinical';
  recordedAt: string | null;
  occurredFrom: string | null;
  version: number;
}

/** Résumé « En bref » rédigé par le serveur (vue simple, M4-07). */
export interface OverviewNarrative {
  sentences: string[];
  attention: string | null;
}

export interface SinceLastSession {
  lastSessionId: string | null;
  lastSessionAt: string | null;
  entries: {
    entryId: string;
    type: EntryType;
    title: string | null;
    status: 'draft' | 'final';
    occurredFrom: string | null;
  }[];
}

/** La synthèse d'un patient pour une fenêtre : un seul payload pour les deux vues (B8). */
export interface OverviewView {
  window: OverviewWindow;
  computedAt: string | null;
  sourceRev: number | null;
  facts: OverviewFacts;
  situations: ActiveSituation[];
  trend: OverviewTrend;
  feelings: OverviewFeelings;
  emotions: TopEmotion[];
  drafts: OverviewDrafts;
  recentSessions: RecentSession[];
  recentActivity: ActivityItem[];
  narrative: OverviewNarrative;
  sinceLastSession: SinceLastSession;
}

/**
 * Moyenne glissante des 7 derniers jours : celle du dernier point de la courbe, qui est toujours
 * aujourd'hui (contrat, TrendDto.points). null si aucun ressenti sur ces 7 jours : on n'en cherche
 * pas une plus ancienne, le libellé de la tuile dit « 7 derniers jours ».
 */
export function lastWeekAverage(points: readonly TrendPoint[]): number | null {
  return points.at(-1)?.average ?? null;
}

// Vides par bloc (B4 : chaque bloc garde son titre et une phrase « apparaîtra ici quand… »).
export const isTrendEmpty = (view: OverviewView): boolean =>
  view.feelings.points.length === 0 && view.trend.points.every((p) => p.average === null);
export const isAttentionEmpty = (view: OverviewView): boolean =>
  view.facts.flags.length === 0 && view.drafts.count === 0 && view.drafts.openSession === null;
export const isSituationsEmpty = (view: OverviewView): boolean => view.situations.length === 0;
export const isMedicationsEmpty = (view: OverviewView): boolean =>
  view.facts.medications.length === 0;
export const isSessionsEmpty = (view: OverviewView): boolean => view.recentSessions.length === 0;
export const isEmotionsEmpty = (view: OverviewView): boolean => view.emotions.length === 0;
export const isActivityEmpty = (view: OverviewView): boolean => view.recentActivity.length === 0;

// Vides des blocs de la vue simple « Récit » (B8, M4-07).
export const isBriefEmpty = (view: OverviewView): boolean =>
  view.narrative.sentences.length === 0 && view.narrative.attention === null;
export const isFeelingsEmpty = (view: OverviewView): boolean => view.feelings.points.length === 0;
export const isSinceEmpty = (view: OverviewView): boolean =>
  view.sinceLastSession.entries.length === 0;
export const isFrameEmpty = (view: OverviewView): boolean =>
  view.facts.followedSince === null &&
  view.facts.sessionCount === 0 &&
  view.facts.flags.length === 0;
export const isTodoEmpty = (view: OverviewView): boolean =>
  view.drafts.count === 0 && view.drafts.openSession === null;

/**
 * L'un des trois états d'un bloc, ou null pour son contenu. Une synthèse déjà lue reste affichée
 * pendant une relecture ou après son échec (bandeau à part) : un bloc vide reste vide, il ne
 * repasse pas au squelette. Sans synthèse : squelette, puis erreur.
 */
export function blockState(
  overview: Loadable<OverviewView>,
  isEmpty: (view: OverviewView) => boolean,
): StateKind | null {
  const { status, data } = overview;
  if (data) return isEmpty(data) ? 'empty' : null;
  return status === 'error' ? 'error' : 'loading';
}

/**
 * Paramètres de la timeline (features/timeline) pour les liens « alerte → timeline filtrée » et
 * « séance → timeline par séance dépliée ». Même valeurs que TIMELINE_FOCUS_PARAM et
 * FILTER_PARAMS de la timeline : redéclarées ici parce qu'importer l'index de la timeline tirerait
 * sa page dans le morceau de la vue d'ensemble (vérifié par overview.model.spec.ts).
 */
export const TIMELINE_PARAMS = {
  focus: 'focus',
  mode: 'mode',
  drafts: 'drafts',
  emotion: 'emotion',
} as const;

/** Paramètre de la vue graphe qui la centre sur une entrée (`graph?root=<id>`, fiche 04). */
export const GRAPH_ROOT_PARAM = 'root';
