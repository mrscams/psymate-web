import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { PatientApi } from './patient.api';
import {
  PatientChanges,
  PatientCreateInput,
  PatientVersion,
  PatientView,
  PractitionerTag,
  normalizeText,
  versionDiffs,
} from './patient.model';

export type ActionStatus = 'idle' | 'busy' | 'error';

interface PatientState {
  patient: Loadable<PatientView>;
  versions: Loadable<PatientVersion[]>;
  /** Tags du praticien, pour l'autocomplétion de la fiche. */
  tags: Loadable<PractitionerTag[]>;
  /** Enregistrement (création ou modification) : statut et problème (422 → champs). */
  saveStatus: ActionStatus;
  saveProblem: ApiProblem | null;
  /** Archivage ou restauration depuis la fiche. */
  archiveStatus: ActionStatus;
  archiveProblem: ApiProblem | null;
  /** Création d'un tag (POST /api/tags) : TAG_IS_EMOTION, TAG_EXISTS. */
  tagStatus: ActionStatus;
  tagProblem: ApiProblem | null;
}

const initialState: PatientState = {
  patient: idle(),
  versions: idle(),
  tags: idle(),
  saveStatus: 'idle',
  saveProblem: null,
  archiveStatus: 'idle',
  archiveProblem: null,
  tagStatus: 'idle',
  tagProblem: null,
};

/**
 * Fiche d'un patient (fiche 16), fournie par la page : lecture, création, modification (PATCH,
 * drapeaux, tags), archivage, restauration, historique des versions. Après une écriture, la fiche
 * vient de la réponse du serveur et l'historique est relu ; rien n'est recalculé localement.
 */
export const PatientStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    current: computed(() => store.patient().data),
    archived: computed(() => !!store.patient().data?.archivedAt),
    history: computed(() => versionDiffs(store.versions().data ?? [])),
    busy: computed(() => store.saveStatus() === 'busy' || store.archiveStatus() === 'busy'),
  })),
  withMethods((store, api = inject(PatientApi)) => {
    async function loadVersions(id: string): Promise<void> {
      patchState(store, { versions: loading(store.versions()) });
      try {
        patchState(store, { versions: loaded(await api.versions(id)) });
      } catch (error) {
        patchState(store, { versions: failed(asProblem(error), store.versions()) });
      }
    }

    return {
      /** GET /api/patients/{id} puis l'historique des versions. */
      async load(id: string): Promise<void> {
        patchState(store, { patient: loading(store.patient()) });
        try {
          patchState(store, { patient: loaded(await api.get(id)) });
        } catch (error) {
          patchState(store, { patient: failed(asProblem(error), store.patient()) });
          return;
        }
        await loadVersions(id);
      },

      loadVersions,

      async loadTags(): Promise<void> {
        patchState(store, { tags: loading(store.tags()) });
        try {
          patchState(store, { tags: loaded(await api.listTags()) });
        } catch (error) {
          patchState(store, { tags: failed(asProblem(error), store.tags()) });
        }
      },

      /** POST /api/patients ; la fiche créée, ou null (problème dans saveProblem). */
      async create(input: PatientCreateInput): Promise<PatientView | null> {
        patchState(store, { saveStatus: 'busy', saveProblem: null });
        try {
          const patient = await api.create(input);
          patchState(store, { saveStatus: 'idle', patient: loaded(patient) });
          return patient;
        } catch (error) {
          patchState(store, { saveStatus: 'error', saveProblem: asProblem(error) });
          return null;
        }
      },

      /**
       * Enregistre les changements dans l'ordre PATCH → drapeaux levés → drapeaux posés → tags.
       * Chaque réponse remplace la fiche affichée : sur une erreur en cours de route, ce qui est
       * déjà enregistré reste visible. L'historique est relu si le PATCH a créé une version.
       */
      async update(changes: PatientChanges): Promise<boolean> {
        const id = store.patient().data?.id;
        if (!id) return false;
        patchState(store, { saveStatus: 'busy', saveProblem: null });
        const accept = (patient: PatientView) => patchState(store, { patient: loaded(patient) });
        try {
          if (changes.patch) accept(await api.patch(id, changes.patch));
          for (const kind of changes.flagsToClear) accept(await api.clearFlag(id, kind));
          for (const flag of changes.flagsToSet) {
            accept(await api.addFlag(id, flag.kind, flag.reason || undefined));
          }
          if (changes.tags) accept(await api.replaceTags(id, changes.tags));
          patchState(store, { saveStatus: 'idle' });
        } catch (error) {
          patchState(store, { saveStatus: 'error', saveProblem: asProblem(error) });
          if (changes.patch) await loadVersions(id);
          return false;
        }
        if (changes.patch) await loadVersions(id);
        return true;
      },

      /** DELETE /api/patients/{id} (archivage logique, idempotent). */
      async archive(): Promise<boolean> {
        const id = store.patient().data?.id;
        if (!id) return false;
        patchState(store, { archiveStatus: 'busy', archiveProblem: null });
        try {
          await api.archive(id);
          patchState(store, { archiveStatus: 'idle' });
          return true;
        } catch (error) {
          patchState(store, { archiveStatus: 'error', archiveProblem: asProblem(error) });
          return false;
        }
      },

      /** POST /api/patients/{id}/restore : la fiche redevient modifiable. */
      async restore(): Promise<boolean> {
        const id = store.patient().data?.id;
        if (!id) return false;
        patchState(store, { archiveStatus: 'busy', archiveProblem: null });
        try {
          patchState(store, { patient: loaded(await api.restore(id)), archiveStatus: 'idle' });
          return true;
        } catch (error) {
          patchState(store, { archiveStatus: 'error', archiveProblem: asProblem(error) });
          return false;
        }
      },

      /**
       * Un libellé saisi devient un tag : existant (même libellé normalisé) → réutilisé ; sinon
       * POST /api/tags. TAG_IS_EMOTION (fiche 16 : « refus avec message explicite ») reste dans
       * tagProblem ; TAG_EXISTS (créé ailleurs entre-temps) → relecture des tags.
       */
      async resolveTag(label: string): Promise<PractitionerTag | null> {
        const wanted = normalizeText(label.replace(/#/g, '').trim());
        if (!wanted) return null;
        const find = () =>
          (store.tags().data ?? []).find(
            (tag) => tag.normalizedLabel === wanted || normalizeText(tag.label) === wanted,
          ) ?? null;
        const known = find();
        patchState(store, { tagProblem: null, tagStatus: 'idle' });
        if (known) return known;
        patchState(store, { tagStatus: 'busy' });
        try {
          const created = await api.createTag(label.replace(/#/g, '').trim());
          patchState(store, {
            tagStatus: 'idle',
            tags: loaded([...(store.tags().data ?? []), created]),
          });
          return created;
        } catch (error) {
          const problem = asProblem(error);
          if (problem.code === 'TAG_EXISTS') {
            try {
              patchState(store, { tags: loaded(await api.listTags()), tagStatus: 'idle' });
              const existing = find();
              if (existing) return existing;
            } catch {
              // La relecture a échoué : on montre le 409 d'origine.
            }
          }
          patchState(store, { tagStatus: 'error', tagProblem: problem });
          return null;
        }
      },

      clearTagProblem(): void {
        patchState(store, { tagProblem: null, tagStatus: 'idle' });
      },
    };
  }),
);
