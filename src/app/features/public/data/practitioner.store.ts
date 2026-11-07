import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { DirectoryApi } from './directory.api';
import { ContactMessage, PractitionerProfile } from './directory.models';

/**
 * Délai minimal entre l'affichage du formulaire et l'envoi (contrat : moins de 3 s, le serveur
 * ignore l'envoi en silence). Un visiteur très rapide n'est pas perdu : l'envoi attend la fin du
 * délai, avec une marge pour l'écart d'horloge.
 */
export const CONTACT_MIN_DELAY_MS = 3500;

export type ContactStatus = 'idle' | 'sending' | 'sent' | 'invalid' | 'rate-limited' | 'error';

interface PractitionerState {
  slug: string | null;
  profile: Loadable<PractitionerProfile>;
  contact: {
    status: ContactStatus;
    problem: ApiProblem | null;
    /** 429 : instant (ms) avant lequel un nouvel envoi est refusé par le serveur. */
    retryAt: number | null;
  };
}

const initialState: PractitionerState = {
  slug: null,
  profile: idle<PractitionerProfile>(),
  contact: { status: 'idle', problem: null, retryAt: null },
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fiche publique d'un praticien (fiche 09, « PublicPractitionerStore ») : profil publié et envoi
 * du formulaire de contact. Fourni par la page (une fiche à la fois).
 */
export const PractitionerStore = signalStore(
  withState(initialState),
  withComputed(({ profile }) => ({
    /** 404 PROFILE_NOT_FOUND : profil inconnu ou non publié. */
    notFound: computed(() => profile().problem?.status === 404),
  })),
  withMethods((store, api = inject(DirectoryApi)) => ({
    /** GET /api/public/directory/practitioners/{slug}. */
    async load(slug: string): Promise<void> {
      const previous = store.slug() === slug ? store.profile() : undefined;
      patchState(store, { slug, profile: loading(previous) });
      try {
        const profile = await api.profile(slug);
        if (store.slug() !== slug) return;
        patchState(store, { profile: loaded(profile) });
      } catch (error) {
        if (store.slug() !== slug) return;
        patchState(store, { profile: failed(asProblem(error), previous) });
      }
    },

    /**
     * POST …/{slug}/contact. `sent` : 202 (relayé, ou ignoré en silence par le serveur : rien ne le
     * distingue ici) ; `invalid` : 422, errors[] à poser sur les champs ; `rate-limited` : 429,
     * `retryAt` dit quand réessayer ; `error` : réseau ou serveur, la saisie est conservée.
     */
    async send(message: ContactMessage, now = Date.now()): Promise<ContactStatus> {
      const slug = store.slug();
      if (!slug) return 'error';
      patchState(store, { contact: { status: 'sending', problem: null, retryAt: null } });
      const elapsed = now - Date.parse(message.formShownAt);
      if (elapsed < CONTACT_MIN_DELAY_MS) await wait(CONTACT_MIN_DELAY_MS - elapsed);
      try {
        await api.sendMessage(slug, message);
        patchState(store, { contact: { status: 'sent', problem: null, retryAt: null } });
        return 'sent';
      } catch (error) {
        const problem = asProblem(error);
        const status: ContactStatus =
          problem.status === 422 || problem.status === 400
            ? 'invalid'
            : problem.status === 429
              ? 'rate-limited'
              : 'error';
        const retryAt =
          status === 'rate-limited'
            ? Date.now() + (problem.retryAfterSeconds ?? 3600) * 1000
            : null;
        patchState(store, { contact: { status, problem, retryAt } });
        return status;
      }
    },

    /** Écrire un nouveau message après une confirmation. */
    resetContact(): void {
      patchState(store, { contact: { status: 'idle', problem: null, retryAt: null } });
    },
  })),
);
