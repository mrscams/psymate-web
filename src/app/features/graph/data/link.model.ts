// Modèles de vue de l'éditeur de lien (fiche 06, handbook §2, couche 4 → 3) : préparés depuis les DTO
// par data/link.api.ts ; la matrice des types (E5.3, G Q12) vient de GET /api/vocabulary/link-types.

import { EntryType, entryTitle } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';

/** Les huit codes du contrat (LinkTypeView.code) : toujours le sens source → cible, jamais un passif. */
export type LinkTypeCode =
  | 'triggers'
  | 'caused_by'
  | 'worsens'
  | 'relieves'
  | 'co_occurs'
  | 'follows'
  | 'part_of'
  | 'treats';

export type LinkLineStyle = 'solid' | 'long_dash' | 'short_dash' | 'dotted' | 'thin' | 'double';

/** Un type de lien du catalogue, libellés dans la langue de l'interface. */
export interface LinkTypeOption {
  code: LinkTypeCode;
  /** false : symétrique (co_occurs), pas de flèche, le sens n'a pas d'effet. */
  directed: boolean;
  /** Verbe vu depuis la source (« déclenche »). */
  label: string;
  /** Verbe vu depuis la cible (« déclenché par ») ; null si non orienté. */
  inverseLabel: string | null;
  sources: readonly EntryType[];
  targets: readonly EntryType[];
  lineStyle: LinkLineStyle;
}

/** Une entrée telle que l'éditeur la montre : la source (GET /api/entries/{id}) ou une cible trouvée. */
export interface LinkEntry {
  id: string;
  type: EntryType;
  /** Titre en texte brut ; null si l'entrée n'en a pas. */
  title: string | null;
  /** Début du texte en texte brut ; null si l'entrée n'a pas de corps. */
  excerpt: string | null;
  occurredFrom: string | null;
  occurredTo: string | null;
  precision: OccurredPrecision | null;
}

/** La source, avec son dossier (l'URL de recherche). */
export interface SourceEntry extends LinkEntry {
  patientId: string;
  archived: boolean;
}

/** Un lien de l'entrée ouverte, vu depuis elle (GET /api/entries/{id}/links). */
export interface EntryLink {
  id: string;
  linkType: LinkTypeCode;
  sourceId: string;
  targetId: string;
  /** Verbe vu depuis l'entrée ouverte (inverse quand elle est la cible). */
  label: string;
  /** Phrase du serveur vue depuis l'entrée ouverte. */
  sentence: string;
  rationale: string | null;
  createdAt: string | null;
}

/** Ce que le panneau envoie : la cible, le type, le sens (reversed : la cible devient la source). */
export interface LinkDraft {
  targetId: string;
  linkType: LinkTypeCode;
  reversed: boolean;
  rationale: string;
}

/** Disponibilité d'une puce pour le couple courant (types incompatibles désactivés avec une aide). */
export interface TypeAvailability {
  type: LinkTypeOption;
  allowed: boolean;
  /** Pourquoi la puce est désactivée ; null si elle est permise. */
  reason: TypeRefusal | null;
}

/**
 * Refus de la matrice : la source n'est pas admise, la cible n'est pas admise, ou les deux.
 * `reversible` : le type est permis dans l'autre sens (« Inverser le sens »).
 */
export interface TypeRefusal {
  source: boolean;
  target: boolean;
  reversible: boolean;
}

/** Longueur maximale de la justification (CreateLinkRequest.rationale). */
export const RATIONALE_MAX = 500;

/** Le type est-il permis de `from` vers `to` ? Un côté inconnu (null) ne restreint rien. */
export function isAllowed(
  type: LinkTypeOption,
  from: EntryType | null,
  to: EntryType | null,
): boolean {
  return (
    (from === null || type.sources.includes(from)) && (to === null || type.targets.includes(to))
  );
}

/**
 * Filtrage des puces par la matrice E5.3 : chaque type du catalogue, permis ou non pour le couple
 * (type de l'entrée qui sera source, type de celle qui sera cible), dans l'ordre du catalogue. Le
 * serveur reste juge (422 LINK_TYPE_NOT_ALLOWED) ; le client grise seulement.
 */
export function typeAvailability(
  types: readonly LinkTypeOption[],
  from: EntryType | null,
  to: EntryType | null,
): TypeAvailability[] {
  return types.map((type) => {
    if (isAllowed(type, from, to)) return { type, allowed: true, reason: null };
    return {
      type,
      allowed: false,
      reason: {
        source: from !== null && !type.sources.includes(from),
        target: to !== null && !type.targets.includes(to),
        reversible: type.directed && isAllowed(type, to, from),
      },
    };
  });
}

/** Les deux extrémités dans l'ordre de la phrase : l'entrée ouverte d'abord, sauf sens inversé. */
export function orient<T>(source: T, target: T, reversed: boolean): { from: T; to: T } {
  return reversed ? { from: target, to: source } : { from: source, to: target };
}

/**
 * Nom d'une entrée dans l'éditeur (UX-A5, titre de repli partagé) : son titre, sinon un extrait de
 * 60 caractères de son texte, sinon « Note · 24 oct. ».
 */
export function linkEntryName(entry: LinkEntry, locale: string): string {
  return entryTitle(
    { type: entry.type, title: entry.title, text: entry.excerpt, occurred: entry.occurredFrom },
    locale,
  );
}

/** L'autre extrémité d'un lien de l'entrée ouverte. */
export function otherEnd(link: Pick<EntryLink, 'sourceId' | 'targetId'>, entryId: string): string {
  return link.sourceId === entryId ? link.targetId : link.sourceId;
}

/** Corps de POST /api/entries/{id}/links : sens inversé = direction incoming (la cible devient source). */
export function toCreateBody(draft: LinkDraft): {
  targetId: string;
  linkType: LinkTypeCode;
  direction: 'outgoing' | 'incoming';
  rationale?: string;
} {
  const rationale = draft.rationale.trim();
  return {
    targetId: draft.targetId,
    linkType: draft.linkType,
    direction: draft.reversed ? 'incoming' : 'outgoing',
    ...(rationale ? { rationale } : {}),
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Texte brut d'un fragment HTML échappé de la recherche (title, snippet : seule la balise mark y est
 * ajoutée) : balises retirées, entités décodées. Jamais injecté comme HTML.
 */
export function plainText(fragment: string | null | undefined): string | null {
  if (fragment === null || fragment === undefined) return null;
  const text = fragment
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      }
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return ENTITIES[code.toLowerCase()] ?? match;
    });
  return text.trim() ? text : null;
}
