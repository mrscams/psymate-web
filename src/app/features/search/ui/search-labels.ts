// Textes et formats de l'écran de recherche (fiche 07) : tous en $localize, dates par Intl.

import { ApiProblem } from '../../../core/http';
import { EntryType } from '../../../shared/ui';
import { formatOccurred, OccurredPrecision } from '../../../shared/util';
import { PeriodPreset, SearchHit, SessionOption } from '../data/search.model';

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

/** Ligne de synthèse (aria-live) : nombre, requête, mode de recherche, durée. */
export function summaryText(
  total: number,
  approximate: number,
  text: string,
  tookMs: number,
): string {
  const query = text ? `« ${text} »` : '';
  if (total === 0 && approximate > 0) {
    return $localize`:Synthèse sans résultat exact@@search.summary.approximateOnly:Aucun résultat exact pour ${query}:query: · ${approximate}:count: résultats approchés · ${tookMs}:ms: ms`;
  }
  if (total === 0) {
    return $localize`:Synthèse sans résultat@@search.summary.none:Aucun résultat pour ${query}:query:`;
  }
  return total === 1
    ? $localize`:Synthèse, un résultat@@search.summary.one:1 résultat pour ${query}:query: · sans accents, par trigrammes · ${tookMs}:ms: ms`
    : $localize`:Synthèse, plusieurs résultats@@search.summary.many:${total}:count: résultats pour ${query}:query: · sans accents, par trigrammes · ${tookMs}:ms: ms`;
}

/** Message d'erreur de la recherche : 400 de syntaxe (date invalide, requête trop longue) ou panne. */
export function searchProblemText(problem: ApiProblem | null): string {
  if (problem?.code === 'SEARCH_BAD_REQUEST') {
    const codes = new Set(problem.errors?.map((error) => error.code) ?? []);
    if (codes.has('INVALID_DATE')) {
      return $localize`:Erreur de recherche@@search.error.invalidDate:Date invalide dans avant: ou après: (format AAAA, AAAA-MM ou AAAA-MM-JJ).`;
    }
    if (codes.has('TOO_LONG')) {
      return $localize`:Erreur de recherche@@search.error.tooLong:La recherche dépasse 200 caractères.`;
    }
    if (codes.has('RANGE_INVERTED')) {
      return $localize`:Erreur de recherche@@search.error.range:La fin de la période précède son début.`;
    }
  }
  return $localize`:Erreur de recherche@@search.error.generic:La recherche est indisponible pour le moment. Votre saisie est conservée.`;
}

/** Une erreur qu'un nouvel essai peut lever (pas une erreur de syntaxe). */
export function canRetry(problem: ApiProblem | null): boolean {
  return problem?.code !== 'SEARCH_BAD_REQUEST';
}
