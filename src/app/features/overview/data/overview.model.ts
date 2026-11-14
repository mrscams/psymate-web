// Modèle de vue de la vue d'ensemble (fiche 02, B4 écran 2, B8) : la réponse de
// GET /api/patients/{id}/overview, normalisée (listes jamais nulles, champs absents → null). Aucun
// calcul clinique ici : la projection est calculée par le serveur ; le web ne fait que la présenter.
// Aucun texte ici (les libellés sont dans ui/overview-labels.ts).
import { EntryType } from '../../../shared/ui';
import { Loadable, StateKind } from '../../../shared/util';

/** Fenêtre de la tendance, des émotions dominantes et des ressentis (préférence overview.window). */
export type OverviewWindow = '30d' | '90d' | '12m';

export const OVERVIEW_WINDOWS: readonly OverviewWindow[] = ['30d', '90d', '12m'];

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

/** La synthèse d'un patient pour une fenêtre : un seul payload, une seule vue (UX-S6). */
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
 * Première et dernière moyenne glissante de la courbe du serveur (points sans moyenne ignorés),
 * pour dire d'où part et où arrive l'intensité sur la fenêtre ; null s'il n'y en a aucune.
 */
export function averageRange(
  points: readonly TrendPoint[],
): { first: number; last: number } | null {
  const values = points.map((p) => p.average).filter((v): v is number => v !== null);
  if (!values.length) return null;
  return { first: values[0], last: values[values.length - 1] };
}

/** Écart minimal (sur 10) entre la première et la dernière moyenne pour parler de hausse ou baisse. */
export const TREND_THRESHOLD = 0.5;

export type TrendDirection = 'up' | 'down' | 'flat';

export function trendDirection(range: { first: number; last: number }): TrendDirection {
  const delta = range.last - range.first;
  if (delta >= TREND_THRESHOLD) return 'up';
  if (delta <= -TREND_THRESHOLD) return 'down';
  return 'flat';
}

/**
 * Début du suivi affiché (UX-B4, UX-B5) : facts.followedSince, sauf s'il manque ou s'il est plus
 * récent qu'une séance que la synthèse montre (dossier créé après coup, follow_up.since vide : le
 * serveur retombe sur la date de création du dossier). On prend alors la plus ancienne séance
 * connue de la synthèse (séances récentes, repères et jours de séance de la fenêtre) : une borne
 * sûre, jamais une date inventée. `fromSessions` dit que la date vient des séances.
 */
export function followedSinceOf(
  view: OverviewView,
): { date: string; fromSessions: boolean } | null {
  const days = [
    ...view.recentSessions.map((s) => s.occurredFrom),
    ...view.trend.markers.filter((m) => m.kind === 'session').map((m) => m.date),
    ...view.feelings.ticks,
  ]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10))
    .sort();
  const firstSession = days[0] ?? null;
  const since = view.facts.followedSince;
  if (since && (!firstSession || since.slice(0, 10) <= firstSession)) {
    return { date: since, fromSessions: false };
  }
  return firstSession ? { date: firstSession, fromSessions: true } : null;
}

// Vides par bloc (B4 : chaque bloc garde son titre et une phrase « apparaîtra ici quand… »).
/** Le graphe : ni ressenti ni moyenne sur la fenêtre. */
export const isFeelingsEmpty = (view: OverviewView): boolean =>
  view.feelings.points.length === 0 && view.trend.points.every((p) => p.average === null);
export const isSinceEmpty = (view: OverviewView): boolean =>
  view.sinceLastSession.entries.length === 0;
export const isSessionsEmpty = (view: OverviewView): boolean => view.recentSessions.length === 0;
export const isFrameEmpty = (view: OverviewView): boolean =>
  followedSinceOf(view) === null && view.facts.flags.length === 0;
export const isMedicationsEmpty = (view: OverviewView): boolean =>
  view.facts.medications.length === 0;
export const isSituationsEmpty = (view: OverviewView): boolean => view.situations.length === 0;
export const isEmotionsEmpty = (view: OverviewView): boolean => view.emotions.length === 0;
export const isTodoEmpty = (view: OverviewView): boolean =>
  view.drafts.count === 0 && view.drafts.openSession === null;

/** Dernière moyenne du serveur au jour `day` (AAAA-MM-JJ) ou avant ; null s'il n'y en a pas. */
function averageAt(points: readonly TrendPoint[], day: string): number | null {
  let value: number | null = null;
  for (const point of points) {
    if (point.date > day) break;
    if (point.average !== null) value = point.average;
  }
  return value;
}

/** Les trois chiffres de la bande « Depuis la séance » (UX-S6, proposition 02 `.facts`). */
export interface SinceFacts {
  /** Ressentis parmi les entrées notées depuis la dernière séance (sinceLastSession). */
  feelings: number;
  /** Dernière moyenne glissante sur 7 jours de la courbe du serveur ; null sans moyenne. */
  intensity: number | null;
  /**
   * Sens de cette moyenne depuis la dernière séance (sa moyenne au jour de la séance, sinon la
   * première de la fenêtre), au seuil d'un demi-point ; null sans point de comparaison.
   */
  direction: TrendDirection | null;
  /** Brouillons en attente du dossier (drafts.count). */
  drafts: number;
}

/**
 * Des valeurs servies, seulement comptées ou lues : le nombre de ressentis notés depuis la séance,
 * la dernière moyenne sur 7 jours du serveur (aucune moyenne calculée ici) et son sens, les
 * brouillons.
 */
export function sinceFacts(view: OverviewView): SinceFacts {
  const points = view.trend.points;
  const values = points.map((p) => p.average).filter((v): v is number => v !== null);
  const intensity = values.at(-1) ?? null;
  const at = view.sinceLastSession.lastSessionAt;
  const base = at ? averageAt(points, at.slice(0, 10)) : (values[0] ?? null);
  return {
    feelings: view.sinceLastSession.entries.filter((e) => e.type === 'feeling').length,
    intensity,
    direction:
      intensity !== null && base !== null ? trendDirection({ first: base, last: intensity }) : null,
    drafts: view.drafts.count,
  };
}

/** « Noté depuis la dernière séance » : dix entrées au plus (décision 3 du 14 novembre 2026). */
export const NOTED_MAX = 10;

/** Une entrée de « Noté depuis la dernière séance », son émotion et son intensité si c'est un ressenti. */
export interface NotedEntry {
  entryId: string;
  type: EntryType;
  title: string | null;
  draft: boolean;
  occurredFrom: string | null;
  /** Le ressenti tel que la fenêtre le sert (feelings.points) ; null hors fenêtre ou autre type. */
  feeling: { label: string; family: EmotionFamily | null; intensity: number } | null;
}

/**
 * Les entrées notées depuis la dernière séance (ordre du serveur, plus récente d'abord), dix au
 * plus. Un ressenti est nommé par son émotion et son intensité, lues sur le point du même
 * identifiant dans feelings.points (libellé de la série du serveur) : rien n'est recalculé.
 */
export function notedEntries(view: OverviewView, max: number = NOTED_MAX): NotedEntry[] {
  const points = new Map(view.feelings.points.map((p) => [p.entryId, p]));
  const labels = new Map(view.feelings.series.map((s) => [s.emotionCode, s.label]));
  return view.sinceLastSession.entries.slice(0, max).map((entry) => {
    const point = entry.type === 'feeling' ? points.get(entry.entryId) : undefined;
    return {
      entryId: entry.entryId,
      type: entry.type,
      title: entry.title,
      draft: entry.status === 'draft',
      occurredFrom: entry.occurredFrom,
      feeling: point
        ? {
            label: labels.get(point.emotionCode) ?? point.emotionCode,
            family: point.family,
            intensity: point.intensity,
          }
        : null,
    };
  });
}

/** Séances de la fenêtre (repères de la courbe) : « 2 sur 90 jours ». */
export function windowSessionCount(view: OverviewView): number {
  return view.trend.markers.filter((m) => m.kind === 'session').length;
}

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
