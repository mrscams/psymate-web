// Utilitaires partagés (fiche 00, handbook §6.5) : moment d'une entrée, pagination par curseur,
// bloc de données chargeable, textes.
export type { CursorPage } from './cursor';
export { appendPage, emptyPage, hasMore } from './cursor';
export type { Loadable, LoadStatus, StateKind } from './loadable';
export { failed, idle, isRefreshing, loaded, loading, stateKind } from './loadable';
export type { FormatOccurredOptions, Occurred, OccurredPrecision } from './occurred';
export { formatOccurred, OCCURRED_PRECISIONS } from './occurred';
export { initials, uniqueId } from './text';
