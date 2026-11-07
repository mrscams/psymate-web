import { ApiProblem } from '../../core/http';
import { CursorPage } from './cursor';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Un bloc de données serveur dans un store (handbook §7) : son statut, sa dernière valeur et, en
 * erreur, l'ApiProblem. La valeur précédente est conservée pendant un rechargement ou une erreur
 * (planche 29 : « le contenu précédent n'est jamais vidé »).
 */
export interface Loadable<T> {
  status: LoadStatus;
  data: T | null;
  problem: ApiProblem | null;
}

export function idle<T>(): Loadable<T> {
  return { status: 'idle', data: null, problem: null };
}

export function loading<T>(previous?: Loadable<T>): Loadable<T> {
  return { status: 'loading', data: previous?.data ?? null, problem: null };
}

export function loaded<T>(data: T): Loadable<T> {
  return { status: 'loaded', data, problem: null };
}

export function failed<T>(problem: ApiProblem, previous?: Loadable<T>): Loadable<T> {
  return { status: 'error', data: previous?.data ?? null, problem };
}

/** Les trois états du composant pm-state (fiche 00, planche 29). */
export type StateKind = 'empty' | 'loading' | 'error';

/**
 * Quel état afficher à la place du contenu, ou null quand le contenu est affichable :
 * - loading sans donnée précédente → squelette ; avec donnée → le contenu reste (grisé par l'écran) ;
 * - error sans donnée → bloc erreur ; avec donnée → le contenu reste, l'écran signale l'erreur à part ;
 * - loaded et vide → état vide.
 */
export function stateKind<T>(
  loadable: Loadable<T>,
  isEmpty: (data: T) => boolean = defaultIsEmpty,
): StateKind | null {
  const hasData = loadable.data !== null && !isEmpty(loadable.data);
  switch (loadable.status) {
    case 'idle':
    case 'loading':
      return hasData ? null : 'loading';
    case 'error':
      return hasData ? null : 'error';
    case 'loaded':
      return hasData ? null : 'empty';
  }
}

/** Un rechargement pendant que la donnée précédente reste affichée (liste grisée 300 ms, planche 29). */
export function isRefreshing(loadable: Loadable<unknown>): boolean {
  return loadable.status === 'loading' && loadable.data !== null;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (isCursorPage(data)) return data.items.length === 0;
  return false;
}

function isCursorPage(value: unknown): value is CursorPage<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as CursorPage<unknown>).items) &&
    'nextCursor' in value
  );
}
