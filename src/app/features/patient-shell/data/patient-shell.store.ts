import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { PreferencesStore } from '../../../core/preferences';
import { PatientShellApi } from './patient-shell.api';
import {
  CloseSessionInput,
  ContactInput,
  isClosed,
  isOpen,
  SessionModality,
  ShellPatient,
  ShellSession,
  ShellTab,
} from './patient-shell.model';

/** idle | loading (lecture du dossier) | saving (action de séance) | error (lecture échouée). */
export type ShellStatus = 'idle' | 'loading' | 'saving' | 'error';

/**
 * Première entrée du dossier (M7-03) : unknown tant que rien n'est lu (ou dossier déjà suivi :
 * pas de lecture), pending si le dossier n'a encore aucune entrée saisie, done sinon.
 */
export type FirstEntryState = 'unknown' | 'pending' | 'done';

interface PatientShellState {
  patientId: string | null;
  patient: ShellPatient | null;
  /** Séance ouverte (« en cours depuis… »), null sinon. */
  currentSession: ShellSession | null;
  /** Dernière séance ou dernier contact clôturé (« Dernière séance : … »), null sinon. */
  lastSession: ShellSession | null;
  /** État mémorisé de chaque onglet (filtres, zoom, position), tant que le dossier reste ouvert. */
  tabs: Partial<Record<ShellTab, unknown>>;
  status: ShellStatus;
  /** Problème de la lecture du dossier (403 PATIENT_FORBIDDEN, 404, 5xx) : état erreur du shell. */
  problem: ApiProblem | null;
  /** Problème de la dernière action de séance (409, 422) : le dossier reste affiché. */
  actionProblem: ApiProblem | null;
  /**
   * Compteur des écritures faites depuis le dossier (entrée enregistrée, séance démarrée, clôturée,
   * contact) : les onglets qui lisent une projection (vue d'ensemble) le suivent pour la relire
   * (handbook §6.5, règle 11 : on relit, on ne recalcule pas). Croissant, jamais remis à zéro.
   */
  revision: number;
  /** Indice « notez la première entrée » : lu sur le résumé de la chronologie, jamais déduit localement. */
  firstEntry: FirstEntryState;
}

const initialState: PatientShellState = {
  patientId: null,
  patient: null,
  currentSession: null,
  lastSession: null,
  tabs: {},
  status: 'idle',
  problem: null,
  actionProblem: null,
  revision: 0,
  firstEntry: 'unknown',
};

/** Séance courante de l'API → (en cours, dernière) ; l'accueil ne compte ni pour l'un ni pour l'autre. */
function split(
  session: ShellSession | null,
): Pick<PatientShellState, 'currentSession' | 'lastSession'> {
  return {
    currentSession: isOpen(session) ? session : null,
    lastSession: isClosed(session) ? session : null,
  };
}

/**
 * Le dossier ouvert (B2, fiche 00 §2, handbook §6.2 et §7) : patient de l'en-tête, séance en cours
 * ou dernière séance, actions de séance, et la mémoire des onglets. Fourni par la page du shell
 * (/patients/:id) : les onglets l'injectent (index.ts) et y rangent leur état pour le retrouver
 * quand on revient ; il disparaît quand on quitte le dossier. Après une écriture, la séance vient
 * de la réponse du serveur (ou est relue), rien n'est recalculé localement.
 */
export const PatientShellStore = signalStore(
  withState(initialState),
  withComputed((store, prefs = inject(PreferencesStore)) => ({
    busy: computed(() => store.status() === 'saving'),
    /** Durée proposée à la clôture : préférence sessions.defaultDurationMin (60 par défaut). */
    defaultDurationMin: computed(() => prefs.defaultDurationMin()),
  })),
  withMethods((store, api = inject(PatientShellApi)) => {
    /** Relit la séance courante (après un 409, un contact) ; un échec garde l'affichage. */
    async function refreshSession(): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      try {
        const session = await api.current(id);
        if (store.patientId() === id) patchState(store, split(session));
      } catch {
        // L'en-tête garde la séance connue ; le problème de l'action est déjà affiché.
      }
    }

    /**
     * Le dossier a-t-il une entrée saisie ? Lu seulement pour un dossier neuf (aucune séance, ou
     * l'accueil seul) et relu après chaque écriture tant que la réponse est « non ». Un échec laisse
     * unknown : pas d'indice plutôt qu'un indice faux.
     */
    async function checkFirstEntry(): Promise<void> {
      const id = store.patientId();
      if (!id) return;
      try {
        const has = await api.hasEntries(id);
        if (store.patientId() === id) patchState(store, { firstEntry: has ? 'done' : 'pending' });
      } catch {
        if (store.patientId() === id) patchState(store, { firstEntry: 'unknown' });
      }
    }

    /** Lance une action de séance ; true si elle a abouti, sinon le problème est dans actionProblem. */
    async function act(action: () => Promise<void>): Promise<boolean> {
      const id = store.patientId();
      patchState(store, { status: 'saving', actionProblem: null });
      try {
        await action();
        if (store.patientId() === id) {
          patchState(store, { status: 'idle', revision: store.revision() + 1 });
        }
        return true;
      } catch (error) {
        if (store.patientId() !== id) return false;
        const problem = asProblem(error);
        patchState(store, { status: 'idle', actionProblem: problem });
        // Conflit : la séance a changé ailleurs (autre onglet du navigateur) ; on relit.
        if (problem.status === 409) await refreshSession();
        return false;
      }
    }

    return {
      /**
       * GET /api/patients/{id} et GET …/sessions/current en parallèle. Un autre dossier efface tout,
       * mémoire des onglets comprise ; le même dossier (Réessayer) garde ce qui est affiché.
       */
      async load(id: string): Promise<void> {
        if (store.patientId() !== id) {
          patchState(store, { ...initialState, patientId: id, revision: store.revision() });
        }
        patchState(store, { status: 'loading', problem: null, actionProblem: null });
        try {
          const [patient, session] = await Promise.all([api.patient(id), api.current(id)]);
          if (store.patientId() !== id) return;
          patchState(store, { patient, ...split(session), status: 'idle' });
          if (!session || session.kind === 'intake') void checkFirstEntry();
        } catch (error) {
          if (store.patientId() !== id) return;
          patchState(store, { status: 'error', problem: asProblem(error) });
        }
      },

      refreshSession,

      /**
       * POST …/sessions/start : l'en-tête passe « en cours » avec la réponse, sans rechargement.
       * Modalité : celle du suivi (fiche 16), présentiel à défaut.
       */
      startSession(modality?: SessionModality): Promise<boolean> {
        const id = store.patientId();
        const patient = store.patient();
        if (!id || !patient || store.currentSession()) return Promise.resolve(false);
        return act(async () => {
          const session = await api.start(id, modality ?? patient.sessionModality);
          if (store.patientId() === id) patchState(store, { currentSession: session });
        });
      },

      /**
       * POST /api/sessions/{id}/close, durée par défaut des préférences : la séance en cours
       * devient la dernière séance (réponse du serveur). 422 → actionProblem pour le formulaire.
       */
      closeSession(input: CloseSessionInput = {}): Promise<boolean> {
        const session = store.currentSession();
        if (!session) return Promise.resolve(false);
        const id = store.patientId();
        const body: CloseSessionInput = {
          durationMin: input.durationMin ?? store.defaultDurationMin(),
          summary: input.summary?.trim() || undefined,
        };
        return act(async () => {
          const closed = await api.close(session.id, body);
          if (store.patientId() === id) {
            patchState(store, { currentSession: null, lastSession: closed });
          }
        });
      },

      /** POST …/sessions/contact (contact hors rendez-vous déjà clôturé), puis relit la séance. */
      contactSession(input: ContactInput): Promise<boolean> {
        const id = store.patientId();
        if (!id) return Promise.resolve(false);
        return act(async () => {
          await api.contact(id, input);
          await refreshSession();
        });
      },

      /** Une écriture a abouti hors du store (éditeur d'entrée) : les projections se relisent. */
      noteWrite(): void {
        patchState(store, { revision: store.revision() + 1 });
        if (store.firstEntry() === 'pending') void checkFirstEntry();
      },

      /** Efface le problème de la dernière action (dialogue fermé, nouvelle saisie). */
      clearActionProblem(): void {
        patchState(store, { actionProblem: null });
      },

      /** Range l'état d'un onglet (filtres, zoom, position) pour le retrouver au retour. */
      rememberTab<T>(tab: ShellTab, state: T): void {
        patchState(store, { tabs: { ...store.tabs(), [tab]: state } });
      },

      /** L'état rangé par l'onglet, ou undefined à la première visite. */
      recallTab<T>(tab: ShellTab): T | undefined {
        return store.tabs()[tab] as T | undefined;
      },
    };
  }),
);

export type PatientShellStore = InstanceType<typeof PatientShellStore>;
