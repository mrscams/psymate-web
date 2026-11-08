import { EmotionMerge } from './emotions.api';

/**
 * Journal des fusions d'émotions (fiche 17). Le contrat ne liste pas les fusions (pas de
 * GET /api/me/emotions/merges) : seule la réponse du merge donne l'identifiant qui permet
 * l'annulation pendant 30 jours. Le journal garde donc ces reçus dans le navigateur, par compte, avec
 * les libellés connus au moment de la fusion (la source fusionnée disparaît de la liste). Le serveur
 * reste juge : une annulation refusée (409, 404) met l'entrée à jour.
 */
export interface MergeJournalEntry {
  merge: EmotionMerge;
  sourceLabel: string;
  targetLabel: string;
  /** Le serveur a répondu MERGE_UNDO_EXPIRED alors que l'horloge locale disait encore « annulable ». */
  expired?: boolean;
}

const KEY_PREFIX = 'vocabulary.emotionMerges.';
/** Au-delà, les plus anciennes sortent du journal (elles ne sont plus annulables depuis longtemps). */
export const JOURNAL_LIMIT = 50;

export function readJournal(owner: string | null): MergeJournalEntry[] {
  if (!owner) return [];
  try {
    const raw = globalThis.localStorage?.getItem(KEY_PREFIX + owner);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function writeJournal(owner: string | null, entries: MergeJournalEntry[]): void {
  if (!owner) return;
  try {
    globalThis.localStorage?.setItem(
      KEY_PREFIX + owner,
      JSON.stringify(entries.slice(0, JOURNAL_LIMIT)),
    );
  } catch {
    // Stockage plein ou interdit : le journal ne vit que dans la page.
  }
}

/** Annulable : ni annulée, ni refusée pour délai, et avant undoUntil. */
export function isUndoable(entry: MergeJournalEntry, now: number = Date.now()): boolean {
  if (entry.merge.undoneAt || entry.expired) return false;
  const until = Date.parse(entry.merge.undoUntil);
  return Number.isFinite(until) && until > now;
}

function isEntry(value: unknown): value is MergeJournalEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<MergeJournalEntry>;
  return (
    typeof entry.merge?.id === 'string' &&
    typeof entry.merge.undoUntil === 'string' &&
    typeof entry.sourceLabel === 'string' &&
    typeof entry.targetLabel === 'string'
  );
}
