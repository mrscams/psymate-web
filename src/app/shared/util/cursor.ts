/** Page d'une liste paginée par curseur opaque : { items, nextCursor } (handbook §6.5). */
export interface CursorPage<T> {
  items: T[];
  /** Curseur de la page suivante, à renvoyer tel quel ; null sur la dernière page. */
  nextCursor: string | null;
}

export function emptyPage<T>(): CursorPage<T> {
  return { items: [], nextCursor: null };
}

export function hasMore(page: CursorPage<unknown>): boolean {
  return page.nextCursor !== null;
}

/**
 * « Charger plus » : concatène la page suivante à la liste affichée. Une clé permet d'ignorer un
 * élément déjà présent (une écriture entre deux pages peut décaler le curseur).
 */
export function appendPage<T>(
  current: CursorPage<T>,
  next: CursorPage<T>,
  key?: (item: T) => string,
): CursorPage<T> {
  if (!key) return { items: [...current.items, ...next.items], nextCursor: next.nextCursor };
  const seen = new Set(current.items.map(key));
  const added = next.items.filter((item) => !seen.has(key(item)));
  return { items: [...current.items, ...added], nextCursor: next.nextCursor };
}
