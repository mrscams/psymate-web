// Libellés et formats de features/overview ($localize, français d'abord ; dates par Intl dans la
// locale de l'interface, UTC en transit). Les codes viennent du contrat.
import { ApiProblem } from '../../../core/http';
import {
  EmotionFamily,
  FlagKind,
  OverviewFeelings,
  OverviewTrend,
  OverviewWindow,
  RecentSession,
  SessionKind,
  SessionModality,
} from '../data/overview.model';

/** Sélecteur de fenêtre (B8) : 30 j / 90 j / 1 an. */
export function windowLabel(window: OverviewWindow): string {
  switch (window) {
    case '30d':
      return $localize`:Sélecteur de fenêtre de la vue d'ensemble@@overview.window.30d:30 j`;
    case '90d':
      return $localize`:Sélecteur de fenêtre de la vue d'ensemble@@overview.window.90d:90 j`;
    case '12m':
      return $localize`:Sélecteur de fenêtre de la vue d'ensemble@@overview.window.12m:1 an`;
  }
}

/** La fenêtre en toutes lettres (titres, phrases). */
export function windowLongLabel(window: OverviewWindow): string {
  switch (window) {
    case '30d':
      return $localize`:Fenêtre de la vue d'ensemble en toutes lettres@@overview.window.30d.long:30 jours`;
    case '90d':
      return $localize`:Fenêtre de la vue d'ensemble en toutes lettres@@overview.window.90d.long:90 jours`;
    case '12m':
      return $localize`:Fenêtre de la vue d'ensemble en toutes lettres@@overview.window.12m.long:12 mois`;
  }
}

export function flagLabel(kind: FlagKind): string {
  switch (kind) {
    case 'watch':
      return $localize`:Drapeau du dossier@@overview.flag.watch:À surveiller`;
    case 'risk':
      return $localize`:Drapeau du dossier@@overview.flag.risk:Risque`;
    case 'shared_care':
      return $localize`:Drapeau du dossier@@overview.flag.sharedCare:Suivi conjoint`;
  }
}

export function sessionKindLabel(kind: SessionKind): string {
  switch (kind) {
    case 'intake':
      return $localize`:Nature d'une séance@@overview.session.kind.intake:Accueil`;
    case 'session':
      return $localize`:Nature d'une séance@@overview.session.kind.session:Séance`;
    case 'contact':
      return $localize`:Nature d'une séance@@overview.session.kind.contact:Contact`;
  }
}

export function modalityLabel(modality: SessionModality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité d'une séance@@overview.session.modality.inPerson:Présentiel`;
    case 'video':
      return $localize`:Modalité d'une séance@@overview.session.modality.video:Visio`;
    case 'phone':
      return $localize`:Modalité d'une séance@@overview.session.modality.phone:Téléphone`;
    case 'email':
      return $localize`:Modalité d'une séance@@overview.session.modality.email:E-mail`;
  }
}

export function familyLabel(family: EmotionFamily | null): string {
  switch (family) {
    case 'joy':
      return $localize`:Famille d'émotions@@overview.family.joy:Joie`;
    case 'trust':
      return $localize`:Famille d'émotions@@overview.family.trust:Confiance`;
    case 'fear':
      return $localize`:Famille d'émotions@@overview.family.fear:Peur`;
    case 'surprise':
      return $localize`:Famille d'émotions@@overview.family.surprise:Surprise`;
    case 'sadness':
      return $localize`:Famille d'émotions@@overview.family.sadness:Tristesse`;
    case 'disgust':
      return $localize`:Famille d'émotions@@overview.family.disgust:Dégoût`;
    case 'anger':
      return $localize`:Famille d'émotions@@overview.family.anger:Colère`;
    case 'anticipation':
      return $localize`:Famille d'émotions@@overview.family.anticipation:Anticipation`;
    default:
      return $localize`:Famille d'émotions inconnue@@overview.family.unknown:Autre`;
  }
}

/** « 4,5 » : une décimale, séparateur de la locale. */
export function formatIntensity(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

/** Jour AAAA-MM-JJ (ou date-heure ISO) → « 17 oct. 2026 », lu en UTC (jour du serveur). */
export function formatDay(value: string, locale: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : undefined,
  }).format(date);
}

/** Date-heure ISO → « samedi 17 octobre 2026 » dans le fuseau du praticien. */
export function formatLongDay(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * En-tête d'une séance : « samedi 17 octobre 2026 · 50 min · Présentiel » (nature si ce n'est pas
 * une séance ordinaire). Des libellés et des valeurs, aucune phrase.
 */
export function sessionHeading(session: RecentSession, locale: string): string {
  const parts: string[] = [];
  parts.push(session.occurredFrom ? formatLongDay(session.occurredFrom, locale) : '—');
  if (session.kind !== 'session') parts.push(sessionKindLabel(session.kind));
  if (session.durationMin !== null) {
    parts.push(
      $localize`:Durée d'une séance@@overview.sessions.duration:${session.durationMin}:minutes: min`,
    );
  }
  if (session.modality) parts.push(modalityLabel(session.modality));
  return parts.join(' · ');
}

/** Date-heure ISO → « 8 nov. 2026, 14:32 » dans le fuseau du praticien. */
export function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Variation d'une émotion dominante : « +6 », « −2 », « = » (jamais la couleur seule). */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '=';
}

/** La variation en toutes lettres, pour les lecteurs d'écran. */
export function deltaText(delta: number, window: OverviewWindow): string {
  const period = windowLongLabel(window);
  if (delta > 0) {
    return $localize`:Variation d'une émotion, en hausse@@overview.emotions.up:${delta}:count: de plus que les ${period}:period: précédents`;
  }
  if (delta < 0) {
    const count = Math.abs(delta);
    return $localize`:Variation d'une émotion, en baisse@@overview.emotions.down:${count}:count: de moins que les ${period}:period: précédents`;
  }
  return $localize`:Variation d'une émotion, stable@@overview.emotions.same:autant que les ${period}:period: précédents`;
}

/**
 * Résumé de la courbe pour les lecteurs d'écran (fiche 02 « Accessibilité » : `role="img"` +
 * `aria-label`) : fenêtre, dernière moyenne et bornes des moyennes du serveur, nombre de
 * ressentis, de séances et de repères de médicament.
 */
export function trendSummary(
  trend: OverviewTrend,
  feelingCount: number,
  window: OverviewWindow,
  locale: string,
): string {
  const period = windowLongLabel(window);
  const values = trend.points.map((p) => p.average).filter((v): v is number => v !== null);
  const sessions = trend.markers.filter((m) => m.kind === 'session').length;
  const medications = trend.markers.filter((m) => m.kind === 'medication').length;
  const counts = $localize`:Résumé de la courbe, comptes@@overview.trend.summary.counts:Ressentis sur la période : ${feelingCount}:feelings: ; séances : ${sessions}:sessions: ; repères de médicament : ${medications}:medications:.`;
  if (!values.length) {
    return (
      $localize`:Résumé de la courbe sans moyenne@@overview.trend.summary.none:Intensité des ressentis sur ${period}:period: : aucune moyenne.` +
      ' ' +
      counts
    );
  }
  const last = formatIntensity(values[values.length - 1], locale);
  const min = formatIntensity(Math.min(...values), locale);
  const max = formatIntensity(Math.max(...values), locale);
  return (
    $localize`:Résumé de la courbe@@overview.trend.summary:Intensité moyenne des ressentis sur ${period}:period: (moyenne glissante sur 7 jours) : de ${min}:min: à ${max}:max: sur 10, dernière valeur ${last}:last:.` +
    ' ' +
    counts
  );
}

/**
 * Description du graphe des ressentis réels pour les lecteurs d'écran (fiche 02 « Accessibilité »,
 * comme la courbe de tendance) : fenêtre, puis pour chaque émotion son nombre de ressentis et ses
 * intensités extrêmes, et les nombres de séances et de repères de médicament. Des valeurs posées
 * dans des libellés : aucune interprétation (ni « monte » ni « baisse », qui sont du serveur).
 */
export function feelingsSummary(feelings: OverviewFeelings, window: OverviewWindow): string {
  const period = windowLongLabel(window);
  const parts = feelings.series
    .map((series) => {
      const values = feelings.points
        .filter((p) => p.emotionCode === series.emotionCode)
        .map((p) => p.intensity);
      if (!values.length) return null;
      const count = values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const label = series.label;
      return min === max
        ? $localize`:Description d'une émotion du graphe, intensité unique@@overview.simple.feelings.summary.one:${label}:emotion: (ressentis : ${count}:count:) à ${min}:value: sur 10`
        : $localize`:Description d'une émotion du graphe@@overview.simple.feelings.summary.range:${label}:emotion: (ressentis : ${count}:count:) de ${min}:min: à ${max}:max: sur 10`;
    })
    .filter((part): part is string => part !== null);
  const sessions = feelings.ticks.length;
  const medications = feelings.markers.length;
  const head = $localize`:Description du graphe des ressentis@@overview.simple.feelings.summary:Ressentis notés sur ${period}:period:, une valeur par point`;
  const counts = $localize`:Description du graphe des ressentis, comptes@@overview.simple.feelings.summary.counts:Jours de séance : ${sessions}:sessions: ; repères de médicament : ${medications}:medications:.`;
  return `${head} : ${parts.join(' ; ')}. ${counts}`;
}

/** Toast quand une bascule (vue, fenêtre) n'a pas pu s'enregistrer : la valeur serveur revient. */
export function saveFailedMessage(problem: ApiProblem): string {
  const fieldMessage = problem.status === 422 ? problem.errors?.[0]?.message : undefined;
  return fieldMessage
    ? $localize`:Toast quand le serveur refuse un réglage de la vue d'ensemble (422)@@overview.saveRejected:Réglage non enregistré : ${fieldMessage}:reason:`
    : $localize`:Toast quand l'enregistrement d'un réglage de la vue d'ensemble échoue@@overview.saveFailed:Impossible d'enregistrer ce réglage. La valeur précédente est rétablie.`;
}
