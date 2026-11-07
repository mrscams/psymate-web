import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { PatientApi } from './patient.api';
import { normalizeText, PractitionerTag } from './patient.model';

export type TagStatus = 'idle' | 'busy' | 'error';

interface TagState {
  /** Tags actifs du praticien (GET /api/tags) : puces de la liste, autocomplétion de la fiche. */
  tags: Loadable<PractitionerTag[]>;
  /** Création d'un tag (POST /api/tags) : TAG_IS_EMOTION, TAG_EXISTS. */
  status: TagStatus;
  problem: ApiProblem | null;
  /** Utilisateur de la session pour qui les tags ont été lus. */
  owner: string | null;
}

const initialState: TagState = { tags: idle(), status: 'idle', problem: null, owner: null };

/**
 * Tags du praticien, une seule fois pour toute la feature (liste et fiche). Fourni à la racine ;
 * remis à zéro au chargement si l'utilisateur de la session a changé (déconnexion puis autre
 * compte dans le même onglet) : rien d'un compte ne reste pour le suivant.
 */
export const TagStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(PatientApi), session = inject(SessionStore)) => {
    const find = (wanted: string): PractitionerTag | null =>
      (store.tags().data ?? []).find(
        (tag) => tag.normalizedLabel === wanted || normalizeText(tag.label) === wanted,
      ) ?? null;

    async function load(): Promise<void> {
      const owner = session.me()?.id ?? null;
      if (owner !== store.owner()) patchState(store, { ...initialState, owner });
      patchState(store, { tags: loading(store.tags()) });
      try {
        patchState(store, { tags: loaded(await api.listTags()) });
      } catch (error) {
        patchState(store, { tags: failed(asProblem(error), store.tags()) });
      }
    }

    return {
      load,

      /**
       * Un libellé saisi devient un tag : existant (même libellé normalisé, « # » ignoré) →
       * réutilisé ; sinon POST /api/tags. TAG_IS_EMOTION (fiche 16 : « refus avec message
       * explicite ») reste dans problem ; TAG_EXISTS (créé ailleurs entre-temps) → relecture.
       */
      async resolve(label: string): Promise<PractitionerTag | null> {
        const clean = label.replace(/#/g, '').trim();
        const wanted = normalizeText(clean);
        if (!wanted) return null;
        patchState(store, { problem: null, status: 'idle' });
        const known = find(wanted);
        if (known) return known;
        patchState(store, { status: 'busy' });
        try {
          const created = await api.createTag(clean);
          patchState(store, {
            status: 'idle',
            tags: loaded([...(store.tags().data ?? []), created]),
          });
          return created;
        } catch (error) {
          const problem = asProblem(error);
          if (problem.code === 'TAG_EXISTS') {
            await load();
            const existing = find(wanted);
            if (existing) {
              patchState(store, { status: 'idle' });
              return existing;
            }
          }
          patchState(store, { status: 'error', problem });
          return null;
        }
      },

      clearProblem(): void {
        patchState(store, { problem: null, status: 'idle' });
      },
    };
  }),
);
