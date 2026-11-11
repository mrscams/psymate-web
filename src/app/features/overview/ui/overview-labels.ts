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
  const medications = feelings.markers.filter((m) => m.kind === 'medication').length;
  const counts = $localize`:Description du graphe des ressentis, comptes@@overview.simple.feelings.summary.counts:Jours de séance : ${sessions}:sessions: ; repères de médicament : ${medications}:medications:.`;
  if (!parts.length) {
    return $localize`:Description du graphe des ressentis, sans ressenti@@overview.simple.feelings.summary.none:Ressentis notés sur ${period}:period:, une valeur par point. ${counts}:counts:`;
  }
  const separator = $localize`:Séparateur entre deux émotions de la description du graphe@@overview.simple.feelings.summary.separator: ; `;
  const details = parts.join(separator);
  return $localize`:Description du graphe des ressentis@@overview.simple.feelings.summary:Ressentis notés sur ${period}:period:, une valeur par point : ${details}:details:. ${counts}:counts:`;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Moment de saisie d'une entrée récente (Activité récente, maquette 02) : « maintenant »,
 * « il y a 6 min », « il y a 3 h » le jour même, « hier », « il y a 4 j » dans la semaine, puis la
 * date courte « 12 sept. » (l'année seulement si ce n'est pas l'année en cours). Intl, locale de
 * l'interface, fuseau du navigateur.
 */
export function formatRecorded(value: string, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const days = Math.round((startOfLocalDay(date) - startOfLocalDay(now)) / DAY_MS);
  if (days === 0) {
    const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / MINUTE_MS));
    if (minutes < 1) return relative.format(0, 'second');
    if (minutes < 60) return relative.format(-minutes, 'minute');
    return relative.format(-Math.floor(minutes / 60), 'hour');
  }
  if (days < 0 && days >= -6) return relative.format(days, 'day');
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/**
 * Ancienneté d'une situation (« 7 mois », « 6 sem. », « 3 ans », « 5 j ») : unités courtes Intl,
 * comme la maquette 02 ; la date exacte reste dans le libellé accessible.
 */
export function formatElapsed(since: string, locale: string, now: Date = new Date()): string {
  const start = new Date(since.length === 10 ? `${since}T00:00:00Z` : since);
  if (Number.isNaN(start.getTime())) return '';
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
  // Jours et semaines en abrégé (« 5 j », « 6 sem. ») ; mois et années en toutes lettres, déjà
  // courts (« 7 mois » : l'abrégé Intl français donne « 7 m. »).
  const unit = (value: number, name: 'day' | 'week' | 'month' | 'year') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: name,
      unitDisplay: name === 'day' || name === 'week' ? 'short' : 'long',
    }).format(value);
  if (days < 14) return unit(days, 'day');
  if (days < 60) return unit(Math.floor(days / 7), 'week');
  const months = Math.floor(days / 30.44);
  if (months < 12) return unit(months, 'month');
  return unit(Math.floor(months / 12), 'year');
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
 * Valeurs d'une série de ressentis pour la phrase-titre du graphe (UX-B5) : « 4/10 → 8/10 » du
 * premier au dernier ressenti, « 3–5/10 » pour une fourchette, « 6/10 » pour une seule valeur.
 * Des valeurs, aucune interprétation.
 */
export function intensityPath(values: readonly number[]): string {
  if (!values.length) return '';
  const first = values[0];
  const last = values[values.length - 1];
  return values.length === 1 || first === last ? `${last}/10` : `${first}/10 → ${last}/10`;
}

export function intensitySpan(values: readonly number[]): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min}/10` : `${min}–${max}/10`;
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
