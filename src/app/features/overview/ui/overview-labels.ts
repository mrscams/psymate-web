// Libellés et formats de features/overview ($localize, français d'abord ; dates par Intl dans la
// locale de l'interface, UTC en transit). Les codes viennent du contrat.
import { ApiProblem } from '../../../core/http';
import {
  EmotionFamily,
  FlagKind,
  OverviewTrend,
  OverviewWindow,
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

/** « il y a 2 min », « il y a 3 h », « hier » : l'âge d'une date-heure à `now`. */
export function formatAgo(value: string, now: number, locale: string): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return value;
  const seconds = Math.round((at - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(0, 'minute');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86_400), 'day');
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

/** Toast quand une bascule (vue, fenêtre) n'a pas pu s'enregistrer : la valeur serveur revient. */
export function saveFailedMessage(problem: ApiProblem): string {
  const fieldMessage = problem.status === 422 ? problem.errors?.[0]?.message : undefined;
  return fieldMessage
    ? $localize`:Toast quand le serveur refuse un réglage de la vue d'ensemble (422)@@overview.saveRejected:Réglage non enregistré : ${fieldMessage}:reason:`
    : $localize`:Toast quand l'enregistrement d'un réglage de la vue d'ensemble échoue@@overview.saveFailed:Impossible d'enregistrer ce réglage. La valeur précédente est rétablie.`;
}
