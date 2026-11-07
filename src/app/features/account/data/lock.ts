import { ApiProblem } from '../../../core/http';

/** Verrou par défaut si le 423 ne dit pas sa durée : 15 minutes (fiches 11 et 18). */
export const DEFAULT_LOCK_SECONDS = 15 * 60;

/** Fin du verrou (ms depuis l'époque) d'un 423 ACCOUNT_LOCKED ; null pour toute autre erreur. */
export function lockedUntilFrom(problem: ApiProblem, now = Date.now()): number | null {
  if (problem.status !== 423) return null;
  return now + (problem.retryAfterSeconds ?? DEFAULT_LOCK_SECONDS) * 1000;
}

/** État d'une action qui vérifie des identifiants ou un code : occupée, en erreur, verrouillée. */
export interface GuardedAction {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
  lockedUntil: number | null;
}

export const GUARDED_IDLE: GuardedAction = { status: 'idle', problem: null, lockedUntil: null };

export const GUARDED_BUSY: GuardedAction = { status: 'busy', problem: null, lockedUntil: null };

export function guardedFailure(problem: ApiProblem): GuardedAction {
  return { status: 'error', problem, lockedUntil: lockedUntilFrom(problem) };
}
