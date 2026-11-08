// Textes de l'éditeur de lien (fiche 06) : aide des types désactivés, forme du trait, problèmes.
import { ApiProblem } from '../../../core/http';
import { EntryType, entryTypeLabel } from '../../../shared/ui';
import { LinkTypeOption, TypeRefusal } from '../data/link.model';

function typeList(types: readonly EntryType[]): string {
  return types.map((type) => entryTypeLabel(type).toLowerCase()).join(', ');
}

/**
 * Aide d'une puce désactivée, depuis la matrice : « “traite” : seulement depuis médicament. »,
 * « … seulement vers situation, séance. », et « Possible en inversant le sens. » si l'autre sens est
 * permis.
 */
export function refusalText(type: LinkTypeOption, refusal: TypeRefusal): string {
  const label = type.label;
  const sources = typeList(type.sources);
  const targets = typeList(type.targets);
  let text: string;
  if (refusal.source && refusal.target) {
    text = $localize`:Aide d'un type de lien interdit pour la source et la cible@@links.refusal.both:« ${label}:label: » : seulement de ${sources}:sources: vers ${targets}:targets:.`;
  } else if (refusal.source) {
    text = $localize`:Aide d'un type de lien interdit pour la source@@links.refusal.source:« ${label}:label: » : seulement depuis ${sources}:sources:.`;
  } else {
    text = $localize`:Aide d'un type de lien interdit pour la cible@@links.refusal.target:« ${label}:label: » : seulement vers ${targets}:targets:.`;
  }
  if (refusal.reversible) {
    text +=
      ' ' +
      $localize`:Aide, le type est permis dans l'autre sens@@links.refusal.reversible:Possible en inversant le sens.`;
  }
  return text;
}

/** Comment le lien se dessinera dans le graphe (LinkTypeView.lineStyle ; pas de flèche si symétrique). */
export function shapeText(type: LinkTypeOption): string {
  if (!type.directed) {
    return $localize`:Forme d'un lien symétrique dans le graphe@@links.shape.symmetric:Dans le graphe : trait pointillé, sans flèche (le lien vaut dans les deux sens).`;
  }
  switch (type.lineStyle) {
    case 'long_dash':
      return $localize`:Forme d'un lien dans le graphe@@links.shape.longDash:Dans le graphe : tirets longs et flèche vers la cible.`;
    case 'short_dash':
      return $localize`:Forme d'un lien dans le graphe@@links.shape.shortDash:Dans le graphe : tirets courts et flèche vers la cible.`;
    case 'dotted':
      return $localize`:Forme d'un lien dans le graphe@@links.shape.dotted:Dans le graphe : pointillé et flèche vers la cible.`;
    case 'thin':
      return $localize`:Forme d'un lien dans le graphe@@links.shape.thin:Dans le graphe : trait fin et flèche vers la cible.`;
    case 'double':
      return $localize`:Forme d'un lien dans le graphe@@links.shape.double:Dans le graphe : trait double et flèche vers la cible.`;
    default:
      return $localize`:Forme d'un lien dans le graphe@@links.shape.solid:Dans le graphe : trait plein et flèche vers la cible.`;
  }
}

/** Alerte du panneau quand l'enregistrement échoue sans erreur de champ reliée. */
export function saveProblemText(problem: ApiProblem): string {
  switch (problem.code) {
    case 'LINK_EXISTS':
      return $localize`:Lien en double (409)@@links.problem.exists:Ce lien existe déjà · Modifier le type ?`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Extrémité archivée (409)@@links.problem.archived:Une des deux entrées est archivée : elle ne peut plus être liée.`;
    case 'ENTRY_NOT_FOUND':
      return $localize`:Entrée introuvable (404)@@links.problem.notFound:Cette entrée n'existe plus. Choisissez une autre cible.`;
    case 'PATIENT_FORBIDDEN':
      return $localize`:Dossier d'un autre praticien (403)@@links.problem.forbidden:Ces entrées ne font pas partie de vos dossiers.`;
    default:
      return problem.status === 0 || problem.status >= 500
        ? $localize`:Lien non enregistré, serveur muet@@links.problem.network:Le lien n'a pas été enregistré : le serveur n'a pas répondu. Votre choix est conservé.`
        : $localize`:Lien non enregistré@@links.problem.other:Le lien n'a pas été enregistré. Vérifiez votre choix et réessayez.`;
  }
}

/** Message sous un lien de la liste quand sa modification ou son retrait échoue. */
export function linkActionProblemText(problem: ApiProblem): string {
  switch (problem.code) {
    case 'LINK_EXISTS':
      return $localize`:Changement vers un type déjà posé (409)@@links.action.exists:Un lien de ce type existe déjà entre ces deux entrées.`;
    case 'LINK_NOT_ACTIVE':
      return $localize`:Lien déjà remplacé (409)@@links.action.inactive:Ce lien a déjà été modifié ou retiré.`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Extrémité archivée (409)@@links.problem.archived:Une des deux entrées est archivée : elle ne peut plus être liée.`;
    case 'VALIDATION_FAILED':
      return (
        problem.errors?.map((error) => error.message).join(' ') ||
        $localize`:Type refusé (422)@@links.action.invalid:Ce type n'est pas permis pour ces deux entrées.`
      );
    default:
      return $localize`:Action sur un lien impossible@@links.action.failed:L'action n'a pas abouti : le serveur n'a pas répondu. Réessayez.`;
  }
}
