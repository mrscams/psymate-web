import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../http/api-problem';
import { SessionApi } from './data/session.api';
import { SessionUser } from './session.model';

export type SessionStatus = 'idle' | 'loading' | 'error';

interface SessionState {
  me: SessionUser | null;
  status: SessionStatus;
  problem: ApiProblem | null;
}

const initialState: SessionState = { me: null, status: 'idle', problem: null };

/**
 * Qui est connecté (fiche 00, « Emplacement et stores ») : nourri par GET /api/auth/me au démarrage
 * et par la réponse 200 de POST /api/auth/login. Aucun jeton : la session est un cookie HttpOnly.
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ me }) => ({
    authenticated: computed(() => me() !== null),
    role: computed(() => me()?.role ?? null),
    isAdmin: computed(() => me()?.role === 'admin'),
    verificationStatus: computed(() => me()?.verificationStatus ?? null),
    passwordChangeRequired: computed(() => me()?.passwordChangeRequired ?? false),
    twoFactorEnabled: computed(() => me()?.twoFactorEnabled ?? false),
  })),
  withMethods((store, api = inject(SessionApi)) => ({
    /**
     * GET /api/auth/me. Un 401 veut dire « pas de session » : état vide, pas une erreur.
     * Ne rejette jamais (appelé par l'initialiseur de l'application).
     */
    async load(): Promise<void> {
      patchState(store, { status: 'loading', problem: null });
      try {
        const me = await api.me();
        patchState(store, { me, status: 'idle' });
      } catch (error) {
        const problem = asProblem(error);
        if (problem.status === 401) patchState(store, { me: null, status: 'idle' });
        else patchState(store, { me: null, status: 'error', problem });
      }
    },

    /** Session ouverte par POST /api/auth/login (200) : le compte renvoyé devient la session. */
    signIn(me: SessionUser): void {
      patchState(store, { me, status: 'idle', problem: null });
    },

    /** Oublie la session côté client (401, compte suspendu, déconnexion). */
    clear(): void {
      patchState(store, initialState);
    },

    /** POST /api/auth/logout puis oubli local, même si l'appel échoue (le cookie expirera). */
    async logout(): Promise<void> {
      try {
        await api.logout();
      } catch {
        // 204 attendu même sans session ; hors ligne, on oublie quand même la session locale.
      } finally {
        patchState(store, initialState);
      }
    },
  })),
);
