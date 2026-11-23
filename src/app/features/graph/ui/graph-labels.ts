// Textes de la vue graphe (fiche 04) : étiquettes des nœuds et des super-nœuds, périodes,
// problèmes de lecture.
import { ApiProblem } from '../../../core/http';
import { formatLocale } from '../../../core/i18n';
import { EntryType, entryTitle } from '../../../shared/ui';
import {
  GraphDirection,
  GraphNode,
  GraphPeriod,
  GraphReading,
  GraphSuperNode,
} from '../data/graph.model';
import { NO_DATE, TypeColumn } from './graph-layout';

/**
 * Nom d'une entrée du graphe (UX-A5, titre de repli partagé) : son titre ; sans titre, « Anxiété
 * 8/10 · 24 oct. » pour un ressenti, « Note · 24 oct. » sinon. Le graphe ne reçoit pas le texte des
 * entrées (GraphNodeDto) : pas d'extrait.
 */
export function nodeName(
  node: GraphNode,
  emotionLabels: Record<string, string>,
  locale: string,
): string {
  return entryTitle(
    {
      type: node.type,
      title: node.title,
      occurred: node.occurred,
      emotion: node.emotion ? (emotionLabels[node.emotion] ?? node.emotion) : null,
      intensity: node.intensity,
    },
    locale,
  );
}

/** Date courte d'un nœud (« 24 oct. », l'année seulement si ce n'est pas l'année en cours). */
export function nodeDate(occurred: string | null, locale: string, now = new Date()): string {
  if (!occurred) return '';
  const date = new Date(occurred);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  // Locale de formatage (Q73) : chiffres latins et calendrier grégorien en arabe.
  return new Intl.DateTimeFormat(formatLocale(locale), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Type d'entrée au pluriel, en minuscules (« 12 ressentis »). */
export function typePlural(type: EntryType): string {
  switch (type) {
    case 'note':
      return $localize`:Type d'entrée au pluriel@@graph.plural.note:notes`;
    case 'event':
      return $localize`:Type d'entrée au pluriel@@graph.plural.event:événements`;
    case 'situation':
      return $localize`:Type d'entrée au pluriel@@graph.plural.situation:situations`;
    case 'feeling':
      return $localize`:Type d'entrée au pluriel@@graph.plural.feeling:ressentis`;
    case 'session':
      return $localize`:Type d'entrée au pluriel@@graph.plural.session:séances`;
    case 'medication':
      return $localize`:Type d'entrée au pluriel@@graph.plural.medication:médicaments`;
  }
}

/** Texte d'un super-nœud : « 12 ressentis regroupés · anxiété majoritaire ». */
export function groupLabel(group: GraphSuperNode, emotionLabels: Record<string, string>): string {
  const count = group.count;
  const types = typePlural(group.type);
  const base = $localize`:Super-nœud du graphe, nombre et type des entrées regroupées@@graph.group.label:${count}:count: ${types}:types: regroupés`;
  if (!group.dominantEmotion) return base;
  const emotion = (emotionLabels[group.dominantEmotion] ?? group.dominantEmotion).toLowerCase();
  return (
    base +
    ' · ' +
    $localize`:Émotion la plus fréquente d'un super-nœud@@graph.group.emotion:${emotion}:emotion: majoritaire`
  );
}

/** Lecture du graphe, dans la barre d'outils. */
export function readingLabel(reading: GraphReading): string {
  switch (reading) {
    case 'causal':
      return $localize`:Lecture du graphe, la place vient des liens@@graph.reading.causal:Chaîne causale`;
    case 'type':
      return $localize`:Lecture du graphe, une colonne par nature d'entrée@@graph.reading.type:Colonnes par type`;
    case 'time':
      return $localize`:Lecture du graphe, une colonne par mois@@graph.reading.time:Chronologie`;
  }
}

/** Sens de lecture du graphe, dans la barre d'outils. */
export function directionLabel(direction: GraphDirection): string {
  switch (direction) {
    case 'right':
      return $localize`:Sens de lecture du graphe@@graph.direction.right:Gauche → droite`;
    case 'down':
      return $localize`:Sens de lecture du graphe@@graph.direction.down:Haut → bas`;
  }
}

/** Titre d'une colonne de la lecture par type. */
export function columnLabel(column: TypeColumn): string {
  switch (column) {
    case 'events':
      return $localize`:Colonne du graphe en lecture par type@@graph.column.events:Événements`;
    case 'situations':
      return $localize`:Colonne du graphe en lecture par type@@graph.column.situations:Situations`;
    case 'feelings':
      return $localize`:Colonne du graphe en lecture par type@@graph.column.feelings:Ressentis et notes`;
    case 'responses':
      return $localize`:Colonne du graphe en lecture par type@@graph.column.responses:Réponses · traitements, séances`;
  }
}

/** Titre d'une colonne de la lecture par mois : « oct. 2026 », ou « Sans date ». */
export function monthLabel(key: string, locale: string): string {
  if (key === NO_DATE) {
    return $localize`:Colonne du graphe des entrées sans date@@graph.month.none:Sans date`;
  }
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(formatLocale(locale), { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

export function periodLabel(period: GraphPeriod): string {
  switch (period) {
    case 'all':
      return $localize`:Période du graphe@@graph.period.all:Toute la période`;
    case '30d':
      return $localize`:Période du graphe@@graph.period.30d:30 derniers jours`;
    case '90d':
      return $localize`:Période du graphe@@graph.period.90d:90 derniers jours`;
    case '12m':
      return $localize`:Période du graphe@@graph.period.12m:12 derniers mois`;
  }
}

export function provenanceLabel(provenance: string): string {
  switch (provenance) {
    case 'manual':
      return $localize`:Provenance d'un lien@@graph.provenance.manual:manuel`;
    case 'ai_suggested':
      return $localize`:Provenance d'un lien@@graph.provenance.aiSuggested:suggéré`;
    case 'ai_confirmed':
      return $localize`:Provenance d'un lien@@graph.provenance.aiConfirmed:suggéré, confirmé`;
    default:
      return provenance;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'accepted':
      return $localize`:Statut d'un lien@@graph.status.accepted:accepté`;
    case 'proposed':
      return $localize`:Statut d'un lien@@graph.status.proposed:suggéré`;
    default:
      return status;
  }
}

/**
 * Le problème vient-il de la racine (404 ENTRY_NOT_FOUND, 409 ENTRY_ARCHIVED, 422 sur le champ
 * root : DIFFERENT_PATIENT) ? Alors « Voir tout le dossier », pas « Filtres par défaut ».
 */
export function isRootProblem(problem: ApiProblem | null): boolean {
  if (!problem) return false;
  if (problem.code === 'ENTRY_NOT_FOUND' || problem.code === 'ENTRY_ARCHIVED') return true;
  return (
    problem.code === 'VALIDATION_FAILED' &&
    !!problem.errors?.some((error) => error.field === 'root')
  );
}

/** Titre de l'état erreur du graphe selon le problème. */
export function graphProblemTitle(problem: ApiProblem | null): string {
  if (problem?.code === 'VALIDATION_FAILED' && isRootProblem(problem)) {
    return $localize`:Racine du graphe d'un autre dossier (422 DIFFERENT_PATIENT)@@graph.problem.otherPatient:Cette entrée n'appartient pas à ce dossier`;
  }
  switch (problem?.code) {
    case 'ENTRY_NOT_FOUND':
      return $localize`:Racine du graphe introuvable (404)@@graph.problem.notFound:Cette entrée n'existe plus`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Racine du graphe archivée (409)@@graph.problem.archived:Cette entrée est archivée`;
    case 'VALIDATION_FAILED':
      return $localize`:Paramètres du graphe refusés (422)@@graph.problem.invalid:Ces filtres ne sont pas valides`;
    case 'PATIENT_FORBIDDEN':
    case 'PATIENT_NOT_FOUND':
      return $localize`:Dossier inaccessible@@graph.problem.forbidden:Ce dossier n'est pas accessible`;
    default:
      return $localize`:Graphe illisible@@graph.problem.title:Impossible de charger le graphe`;
  }
}

/** Phrase de l'état erreur ; undefined : la phrase par défaut du composant état. */
export function graphProblemMessage(problem: ApiProblem | null): string | undefined {
  if (isRootProblem(problem)) {
    return $localize`:Que faire quand la racine est perdue@@graph.problem.rootMessage:Le graphe peut se centrer sur tout le dossier.`;
  }
  switch (problem?.code) {
    case 'VALIDATION_FAILED':
      return (
        problem?.errors?.map((error) => error.message).join(' ') ||
        $localize`:Que faire quand les filtres sont refusés@@graph.problem.invalidMessage:Revenez aux filtres par défaut.`
      );
    default:
      return undefined;
  }
}

/** Le problème se règle-t-il en réessayant (réseau, 5xx, 429) ? */
export function isRetryable(problem: ApiProblem | null): boolean {
  const status = problem?.status ?? 0;
  return status === 0 || status >= 500 || status === 429;
}
