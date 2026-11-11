// Textes et formats de l'écran de recherche (fiche 07) : tous en $localize, dates par Intl.

import { ApiProblem } from '../../../core/http';
import { EntryType, entryTitle } from '../../../shared/ui';
import { formatOccurred, OccurredPrecision } from '../../../shared/util';
import { PeriodPreset, plainText, SearchHit, SessionOption } from '../data/search.model';

/** Libellé pluriel d'une puce de type (fiche 07 : « Notes 5 »). */
export function typeChipLabel(type: EntryType): string {
  switch (type) {
    case 'note':
      return $localize`:Puce de type, pluriel@@search.type.note:Notes`;
    case 'event':
      return $localize`:Puce de type, pluriel@@search.type.event:Événements`;
    case 'situation':
      return $localize`:Puce de type, pluriel@@search.type.situation:Situations`;
    case 'feeling':
      return $localize`:Puce de type, pluriel@@search.type.feeling:Ressentis`;
    case 'session':
      return $localize`:Puce de type, pluriel@@search.type.session:Séances`;
    case 'medication':
      return $localize`:Puce de type, pluriel@@search.type.medication:Médicaments`;
  }
}

export function periodLabel(preset: PeriodPreset): string {
  switch (preset) {
    case 'all':
      return $localize`:Période de recherche@@search.period.all:Tout le dossier`;
    case '30d':
      return $localize`:Période de recherche@@search.period.30d:30 derniers jours`;
    case '90d':
      return $localize`:Période de recherche@@search.period.90d:90 derniers jours`;
    case '12m':
      return $localize`:Période de recherche@@search.period.12m:12 derniers mois`;
    case 'custom':
      return $localize`:Période de recherche venue de l'URL@@search.period.custom:Période choisie`;
  }
}

/** Mention de précision d'une date (fiche 07 : « précision jour ») ; rien pour une date exacte. */
export function precisionLabel(precision: OccurredPrecision): string | null {
  switch (precision) {
    case 'exact':
      return null;
    case 'day':
      return $localize`:Précision d'une date@@search.precision.day:précision jour`;
    case 'month':
      return $localize`:Précision d'une date@@search.precision.month:précision mois`;
    case 'year':
      return $localize`:Précision d'une date@@search.precision.year:précision année`;
    case 'period':
      return $localize`:Précision d'une date@@search.precision.period:période`;
    case 'life_phase':
      return $localize`:Précision d'une date@@search.precision.lifePhase:phase de vie`;
  }
}

export function formatDay(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function sessionLabel(session: SessionOption, locale: string): string {
  const day = formatDay(session.startedAt, locale);
  return $localize`:Séance désignée par sa date@@search.session.label:Séance du ${day}:day:`;
}

/**
 * Titre d'une entrée en texte brut, par entryTitle() (UX-A5) : son titre, sinon « Type · date
 * courte » (« Note · 24 oct. »). Le texte n'est pas passé : l'extrait est affiché juste dessous
 * (et, avec une recherche, il commence au milieu du corps) ; l'aperçu montre le corps entier sous
 * le titre. Hors précision exacte, la date se lit en UTC (jours entiers, comme formatOccurred).
 */
export function titleOf(
  entry: { type: EntryType; title: string | null; occurredFrom: string | null },
  precision: OccurredPrecision,
  locale: string,
): string {
  return entryTitle(
    { type: entry.type, title: entry.title, occurred: entry.occurredFrom },
    locale,
    precision === 'exact' ? {} : { timeZone: 'UTC' },
  );
}

/** Titre d'un résultat (titre surligné recollé, sinon repli entryTitle). */
export function hitTitle(hit: SearchHit, locale: string): string {
  return titleOf({ ...hit, title: plainText(hit.title) }, hit.precision, locale);
}

export function hitWhen(hit: SearchHit, locale: string): string {
  return formatOccurred(
    { from: hit.occurredFrom, to: hit.occurredTo, precision: hit.precision },
    locale,
  );
}

export function visibilityLabel(visibility: 'private' | 'clinical'): string {
  return visibility === 'private'
    ? $localize`:Visibilité d'une entrée@@search.visibility.private:privée`
    : $localize`:Visibilité d'une entrée@@search.visibility.clinical:clinique`;
}

/**
 * Ligne de synthèse (aria-live) : nombre, requête, durée. Guillemets et pluriels dans chaque
 * message (la langue cible choisit les siens). Les exacts viennent du plein texte sans accents ni
 * casse ; les approchés, des trigrammes.
 */
export function summaryText(
  total: number,
  approximate: number,
  text: string,
  tookMs: number,
): string {
  if (total === 0 && approximate === 1) {
    return $localize`:Synthèse sans résultat exact, un approché@@search.summary.approximateOne:Aucun résultat exact pour « ${text}:query: » · 1 résultat approché (trigrammes) · ${tookMs}:ms: ms`;
  }
  if (total === 0 && approximate > 1) {
    return $localize`:Synthèse sans résultat exact, plusieurs approchés@@search.summary.approximateOnly:Aucun résultat exact pour « ${text}:query: » · ${approximate}:count: résultats approchés (trigrammes) · ${tookMs}:ms: ms`;
  }
  if (total === 0) {
    return $localize`:Synthèse sans résultat@@search.summary.none:Aucun résultat pour « ${text}:query: »`;
  }
  return total === 1
    ? $localize`:Synthèse, un résultat@@search.summary.one:1 résultat pour « ${text}:query: » · sans accents ni casse · ${tookMs}:ms: ms`
    : $localize`:Synthèse, plusieurs résultats@@search.summary.many:${total}:count: résultats pour « ${text}:query: » · sans accents ni casse · ${tookMs}:ms: ms`;
}

/** Champs en faute d'un 400 SEARCH_BAD_REQUEST. */
function badFields(problem: ApiProblem | null): Set<string> {
  return new Set(
    problem?.code === 'SEARCH_BAD_REQUEST'
      ? (problem.errors ?? []).map((error) => error.field)
      : [],
  );
}

/** Message d'erreur : 400 selon le champ en faute (q, from / to, session), sinon panne. */
export function searchProblemText(problem: ApiProblem | null): string {
  if (problem?.code === 'SEARCH_BAD_REQUEST') {
    const errors = problem.errors ?? [];
    const onQuery = errors.filter((error) => error.field === 'q').map((error) => error.code);
    if (onQuery.includes('INVALID_DATE')) {
      return $localize`:Erreur de recherche@@search.error.invalidDate:Date invalide dans avant: ou après: (format AAAA, AAAA-MM ou AAAA-MM-JJ).`;
    }
    if (onQuery.includes('TOO_LONG')) {
      return $localize`:Erreur de recherche@@search.error.tooLong:La recherche dépasse 200 caractères.`;
    }
    if (isPeriodProblem(problem)) {
      return $localize`:Erreur de recherche@@search.error.period:La période de l'adresse est invalide. Revenez à tout le dossier.`;
    }
  }
  return $localize`:Erreur de recherche@@search.error.generic:La recherche est indisponible pour le moment. Votre saisie est conservée.`;
}

/** 400 sur from / to (date impossible, période inversée) : « Tout le dossier » la corrige. */
export function isPeriodProblem(problem: ApiProblem | null): boolean {
  const fields = badFields(problem);
  return fields.has('from') || fields.has('to');
}

/** Une erreur qu'un nouvel essai peut lever (pas une erreur de syntaxe). */
export function canRetry(problem: ApiProblem | null): boolean {
  return problem?.code !== 'SEARCH_BAD_REQUEST';
}
