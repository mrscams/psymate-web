import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AgendaApi } from './agenda.api';
import { CreatedAppointments, FreeBusy, NewAppointment, PatientAppointments } from './agenda.model';

interface NewAppointmentState {
  /** Défauts et rendez-vous à venir du patient choisi. */
  patient: Loadable<PatientAppointments>;
  /** Conflits et voisinage du créneau ; null tant qu'inconnu (silencieux en cas d'erreur). */
  freeBusy: FreeBusy | null;
  submitting: boolean;
  problem: ApiProblem | null;
}

const initialState: NewAppointmentState = {
  patient: idle(),
  freeBusy: null,
  submitting: false,
  problem: null,
};

/**
 * État serveur du panneau « Nouveau rendez-vous » (fiche 15b), fourni par le panneau : défauts du
 * patient choisi, conflits et voisinage du créneau, création (la recherche des patients est celle de
 * `pm-patient-picker`, PatientSearchStore). Chaque lecture ignore les réponses dépassées par une
 * plus récente.
 */
export const NewAppointmentStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(AgendaApi)) => {
    let patientTicket = 0;
    let slotTicket = 0;

    return {
      /** Patient choisi : ses défauts (durée, modalité, rythme) et ses rendez-vous à venir. */
      async loadPatient(patientId: string | null): Promise<PatientAppointments | null> {
        const ticket = ++patientTicket;
        if (!patientId) {
          patchState(store, { patient: idle() });
          return null;
        }
        patchState(store, { patient: loading() });
        try {
          const value = await api.patientAppointments(patientId);
          if (ticket !== patientTicket) return null;
          patchState(store, { patient: loaded(value) });
          return value;
        } catch (error) {
          if (ticket === patientTicket) patchState(store, { patient: failed(asProblem(error)) });
          return null;
        }
      },
      /** Conflits et voisinage du créneau ; une erreur réseau efface l'information, sans message. */
      async checkSlot(from: Date | null, to: Date | null, tz: string): Promise<void> {
        const ticket = ++slotTicket;
        if (!from || !to || to <= from) {
          patchState(store, { freeBusy: null });
          return;
        }
        try {
          const freeBusy = await api.freeBusy(from, to, tz);
          if (ticket === slotTicket) patchState(store, { freeBusy });
        } catch {
          if (ticket === slotTicket) patchState(store, { freeBusy: null });
        }
      },
      /** `POST /api/appointments` ; null et `problem` posé en cas d'échec. */
      async create(request: NewAppointment): Promise<CreatedAppointments | null> {
        if (store.submitting()) return null;
        patchState(store, { submitting: true, problem: null });
        try {
          const created = await api.create(request);
          patchState(store, { submitting: false });
          return created;
        } catch (error) {
          patchState(store, { submitting: false, problem: asProblem(error) });
          return null;
        }
      },
    };
  }),
);
