// Mode par séance (fiche 03, état B ; M3-03) : regroupement des éléments lus par séance, et détail
// d'une séance dépliée (GET /api/entries/{id}). Calculs purs, aucun texte.

import { ApiProblem } from '../../../core/http';
import { TimelineItem } from './timeline.model';

/** Une séance et les éléments qui lui sont rattachés (sessionId), ou le groupe « hors séance ». */
export interface SessionGroup {
  /** Identifiant de la séance ; null pour le groupe des éléments hors séance. */
  id: string | null;
  /** L'élément séance, s'il est dans les éléments lus (filtres qui le gardent). */
  session: TimelineItem | null;
  /** Début de la séance (élément lu, sinon index des séances) ; null pour le groupe hors séance. */
  from: string | null;
  /** Éléments rattachés, dans l'ordre de la chronologie (du plus récent au plus ancien). */
  entries: TimelineItem[];
}

function time(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * Range les éléments par séance. Une séance apparaît si elle est elle-même dans les éléments lus
 * ou si au moins un élément lui est rattaché (avec un filtre « anxiété », seules les séances où
 * l'anxiété a été notée). Un élément dont la séance est inconnue (séance privée exclue, au-delà de
 * l'index) va dans le groupe hors séance, en dernier. Séances de la plus récente à la plus ancienne.
 */
export function groupBySession(
  items: readonly TimelineItem[],
  sessions: Readonly<Record<string, string>>,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  const outside: TimelineItem[] = [];
  const known = new Set(items.filter((item) => item.type === 'session').map((item) => item.id));
  const group = (id: string): SessionGroup => {
    let found = groups.get(id);
    if (!found) {
      found = { id, session: null, from: sessions[id] ?? null, entries: [] };
      groups.set(id, found);
    }
    return found;
  };
  for (const item of items) {
    if (item.type === 'session') {
      const found = group(item.id);
      found.session = item;
      found.from = item.occurred.from ?? found.from;
    } else if (item.sessionId && (known.has(item.sessionId) || sessions[item.sessionId])) {
      group(item.sessionId).entries.push(item);
    } else {
      outside.push(item);
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => time(b.from) - time(a.from) || (b.id ?? '').localeCompare(a.id ?? ''),
  );
  if (outside.length) sorted.push({ id: null, session: null, from: null, entries: outside });
  return sorted;
}

export type SessionModality = 'in_person' | 'video' | 'phone' | 'email';
export type SessionKind = 'intake' | 'session' | 'contact';

/** Détail d'une séance dépliée (EntryDto de type session). */
export interface SessionDetail {
  id: string;
  /** Début et fin (fin connue à la clôture). */
  from: string | null;
  to: string | null;
  durationMin: number | null;
  modality: SessionModality | null;
  kind: SessionKind | null;
  /** Null tant que la séance est ouverte. */
  closedAt: string | null;
  /** Compte rendu (texte de la version courante) ; null s'il n'y en a pas. */
  summary: string | null;
}

/** Détail d'une séance dans le store : en cours, chargé, ou en échec. */
export interface SessionDetailState {
  status: 'loading' | 'loaded' | 'error';
  detail: SessionDetail | null;
  problem: ApiProblem | null;
}
