import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { ConfirmEmailApi, SessionCheck } from './confirm-email.api';

/** Délai entre deux renvois (contrat : 1 renvoi par minute et par compte ; fiche 25). */
export const RESEND_COOLDOWN_SECONDS = 60;

export type ConfirmStatus = 'idle' | 'busy' | 'confirmed' | 'expired' | 'error';

interface ActionState {
  status: 'idle' | 'busy' | 'done' | 'error';
  problem: ApiProblem | null;
}

interface ConfirmEmailState {
  /** Adresse à confirmer, connue de l'inscription, de la connexion refusée ou de la session ; null sinon. */
  email: string | null;
  /** Traitement du lien /confirmer-email/:token. */
  confirm: { status: ConfirmStatus; problem: ApiProblem | null };
  /** Renvoi de l'e-mail ; `allowedAt` : instant (ms) du prochain renvoi possible, null si tout de suite. */
  resend: ActionState & { allowedAt: number | null };
  /** Correction de l'adresse (POST /api/auth/email/change, variante publique). */
  change: ActionState;
}

const ACTION_IDLE: ActionState = { status: 'idle', problem: null };

const initialState: ConfirmEmailState = {
  email: null,
  confirm: { status: 'idle', problem: null },
  resend: { ...ACTION_IDLE, allowedAt: null },
  change: ACTION_IDLE,
};

/**
 * État de la confirmation d'e-mail (fiche 25). Fourni à la racine : l'adresse mémorisée par la page
 * de connexion (403 EMAIL_NOT_CONFIRMED) ou par l'inscription doit survivre à la navigation vers
 * /confirmer-email, et le délai entre deux renvois à un aller-retour entre les états de la page.
 */
export const ConfirmEmailStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ resend }) => ({
    /** Instant du prochain renvoi autorisé (ms depuis l'époque), null si aucun délai ne court. */
    resendAllowedAt: computed(() => resend().allowedAt),
  })),
  withMethods((store, api = inject(ConfirmEmailApi)) => ({
    /** L'inscription ou la connexion savent quelle adresse attend sa confirmation. */
    remember(email: string): void {
      const trimmed = email.trim();
      if (trimmed) patchState(store, { email: trimmed });
    },

    /**
     * POST /api/auth/email/confirm. `confirmed` : session ouverte dans ce navigateur (la page recharge
     * SessionStore puis va à /patients) ; `expired` : 410, jeton inconnu, déjà utilisé, expiré ou
     * remplacé (la page va à /confirmer-email/expire) ; `error` : réseau ou serveur, à réessayer.
     */
    async confirmToken(token: string): Promise<ConfirmStatus> {
      patchState(store, { confirm: { status: 'busy', problem: null } });
      try {
        await api.confirm(token);
        patchState(store, { confirm: { status: 'confirmed', problem: null } });
        return 'confirmed';
      } catch (error) {
        const problem = asProblem(error);
        const status: ConfirmStatus = problem.status === 410 ? 'expired' : 'error';
        patchState(store, { confirm: { status, problem } });
        return status;
      }
    },

    /**
     * POST /api/auth/email/resend → 202 quoi qu'il arrive : l'écran dit « si l'adresse correspond à un
     * compte à confirmer, un nouveau lien est parti ». Le délai d'une minute démarre côté client
     * (le serveur refuse en silence un renvoi trop rapproché).
     */
    async resendEmail(email = store.email() ?? ''): Promise<boolean> {
      const trimmed = email.trim();
      if (!trimmed) return false;
      patchState(store, { resend: { status: 'busy', problem: null, allowedAt: null } });
      try {
        await api.resend(trimmed);
        patchState(store, {
          email: trimmed,
          resend: {
            status: 'done',
            problem: null,
            allowedAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
          },
        });
        return true;
      } catch (error) {
        patchState(store, {
          resend: { status: 'error', problem: asProblem(error), allowedAt: null },
        });
        return false;
      }
    },

    /**
     * POST /api/auth/email/change { email, password, newEmail } → 202 dans tous les cas (G Q49) :
     * la carte affiche la nouvelle adresse et le délai d'une minute repart (un changement compte
     * comme un renvoi). 422 (champ mal formé) et 423 (verrou) arrivent en `problem`.
     */
    async changeEmail(
      password: string,
      newEmail: string,
      email = store.email() ?? '',
    ): Promise<boolean> {
      patchState(store, { change: { status: 'busy', problem: null } });
      try {
        await api.changeEmail(email.trim(), password, newEmail.trim());
        patchState(store, {
          email: newEmail.trim(),
          change: { status: 'done', problem: null },
          resend: {
            status: 'idle',
            problem: null,
            allowedAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
          },
        });
        return true;
      } catch (error) {
        patchState(store, { change: { status: 'error', problem: asProblem(error) } });
        return false;
      }
    },

    /** Le formulaire de correction se referme : prêt pour une nouvelle saisie. */
    resetChange(): void {
      patchState(store, { change: ACTION_IDLE });
    },

    /** Le compte à rebours est fini : le bouton « Renvoyer » redevient actif. */
    clearCooldown(): void {
      patchState(store, { resend: { ...store.resend(), allowedAt: null } });
    },

    /**
     * GET /api/auth/session (polling discret de la fiche 25) : l'état à jour, ou null sans session
     * dans ce navigateur (401) ou en cas d'erreur. Si l'adresse est confirmée, l'appelant recharge
     * SessionStore et quitte la page.
     */
    async checkSession(): Promise<SessionCheck | null> {
      try {
        const check = await api.session();
        if (check.email) patchState(store, { email: check.email });
        return check;
      } catch {
        return null;
      }
    },
  })),
);
