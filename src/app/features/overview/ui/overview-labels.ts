// Libellés et formats de features/overview ($localize, français d'abord ; dates par Intl dans la
// locale de l'interface, UTC en transit). Les codes viennent du contrat.
import { ApiProblem } from '../../../core/http';
import {
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

/**
 * Date-heure ISO → « samedi 17 octobre » dans le fuseau du praticien, l'année seulement si ce
 * n'est pas l'année en cours (maquettes 02 et 02b).
 */
export function formatLongDay(value: string, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/**
 * Ligne d'une séance récente (UX-S6, proposition 02 `.sess`) : « Jeudi 5 novembre · cabinet ·
 * 50 min » ; la nature si ce n'est pas une séance ordinaire (« Accueil »). La modalité au même
 * libellé que l'en-tête patient (`sessionModalityLabel`, passée par l'appelant).
 */
export function sessionLine(
  session: RecentSession,
  locale: string,
  modality: (code: SessionModality) => string,
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  if (session.occurredFrom) {
    const day = formatLongDay(session.occurredFrom, locale, now);
    parts.push(day.charAt(0).toLocaleUpperCase(locale) + day.slice(1));
  } else {
    parts.push('—');
  }
  if (session.kind !== 'session') parts.push(sessionKindLabel(session.kind));
  if (session.modality) parts.push(modality(session.modality));
  if (session.durationMin !== null) {
    parts.push(
      $localize`:Durée d'une séance@@overview.sessions.duration:${session.durationMin}:minutes: min`,
    );
  }
  return parts.join(' · ');
}

/** Jour → « 15 oct. » (« 15 oct. 2025 » hors de l'année en cours), lu en UTC pour un AAAA-MM-JJ. */
export function formatShortDay(value: string, locale: string, now: Date = new Date()): string {
  const dateOnly = value.length === 10;
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  const year = dateOnly ? date.getUTCFullYear() : date.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: year === now.getFullYear() ? undefined : 'numeric',
    timeZone: dateOnly ? 'UTC' : undefined,
  }).format(date);
}

/** Date-heure ISO → « 12 nov. 09:20 » (moment d'une entrée, maquette 02 `.when`). */
export function formatShortDateTime(value: string, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${formatShortDay(value, locale, now)} ${time}`;
}

/** Mois → « sept. 2026 » (suivi depuis), ou « oct. » dans l'année en cours si `short`. */
export function formatMonth(
  value: string,
  locale: string,
  short = false,
  now: Date = new Date(),
): string {
  const dateOnly = value.length === 10;
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  const year = dateOnly ? date.getUTCFullYear() : date.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: short && year === now.getFullYear() ? undefined : 'numeric',
    timeZone: dateOnly ? 'UTC' : undefined,
  }).format(date);
}

/** Heure de calcul de la synthèse : « 11:03 » le jour même, sinon « 8 nov. 11:03 ». */
export function formatComputedAt(value: string, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return formatShortDateTime(value, locale, now);
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
  const medications = feelings.markers.filter((m) => m.kind === 'medication').length;
  const counts = $localize`:Description du graphe des ressentis, comptes@@overview.simple.feelings.summary.counts:Jours de séance : ${sessions}:sessions: ; repères de médicament : ${medications}:medications:.`;
  if (!parts.length) {
    return $localize`:Description du graphe des ressentis, sans ressenti@@overview.simple.feelings.summary.none:Ressentis notés sur ${period}:period:, une valeur par point. ${counts}:counts:`;
  }
  const separator = $localize`:Séparateur entre deux émotions de la description du graphe@@overview.simple.feelings.summary.separator: ; `;
  const details = parts.join(separator);
  return $localize`:Description du graphe des ressentis@@overview.simple.feelings.summary:Ressentis notés sur ${period}:period:, une valeur par point : ${details}:details:. ${counts}:counts:`;
}

/** Un morceau d'une phrase du serveur : en gras s'il porte un fait (date, chiffre, citation). */
export interface Emphasis {
  text: string;
  strong: boolean;
}

const MONTHS =
  'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|' +
  'janv\\.|févr\\.|avr\\.|juil\\.|sept\\.|oct\\.|nov\\.|déc\\.|' +
  'January|February|March|April|May|June|July|August|September|October|November|December|' +
  'Jan\\.|Feb\\.|Mar\\.|Apr\\.|Aug\\.|Sept?\\.|Oct\\.|Nov\\.|Dec\\.';

/**
 * Faits d'une phrase : dates (« 12 mars 2025 », « March 12, 2025 »), citations (« … », “…”) et
 * nombres avec leur unité courte (« 4,5 », « 8/10 », « 31 »). Jamais à l'intérieur d'un mot.
 */
const FACTS = new RegExp(
  [
    `\\d{1,2}(?:er)?\\s(?:${MONTHS})(?:\\s\\d{4})?`,
    `(?:${MONTHS})\\s\\d{1,2}(?:,\\s\\d{4})?`,
    '«[^»]+»',
    '“[^”]+”',
    '(?<![\\p{L}\\d])\\d+(?:[.,]\\d+)?(?:\\s?/\\s?10)?(?![\\p{L}\\d])',
  ].join('|'),
  'gu',
);

/**
 * « En bref » (UX-B5, maquette 02b) : les phrases du serveur restent mot pour mot ; seuls leurs
 * faits (dates, chiffres, citations) sont mis en gras, comme la maquette. Aucun texte ajouté.
 */
export function emphasize(sentence: string): Emphasis[] {
  const parts: Emphasis[] = [];
  let last = 0;
  for (const match of sentence.matchAll(FACTS)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: sentence.slice(last, start), strong: false });
    parts.push({ text: match[0], strong: true });
    last = start + match[0].length;
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), strong: false });
  return parts;
}

/**
 * Horodatage de l'axe du temps d'ECharts (il lit « AAAA-MM-JJ » comme minuit local) → le jour
 * AAAA-MM-JJ qu'il représente.
 */
export function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Toast quand une bascule (vue, fenêtre) n'a pas pu s'enregistrer : la valeur serveur revient. */
export function saveFailedMessage(problem: ApiProblem): string {
  const fieldMessage = problem.status === 422 ? problem.errors?.[0]?.message : undefined;
  return fieldMessage
    ? $localize`:Toast quand le serveur refuse un réglage de la vue d'ensemble (422)@@overview.saveRejected:Réglage non enregistré : ${fieldMessage}:reason:`
    : $localize`:Toast quand l'enregistrement d'un réglage de la vue d'ensemble échoue@@overview.saveFailed:Impossible d'enregistrer ce réglage. La valeur précédente est rétablie.`;
}
