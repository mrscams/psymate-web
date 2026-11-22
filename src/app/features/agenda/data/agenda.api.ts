import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AgendaService,
  AgendaWindowDto,
  AppointmentDto,
  ConflictDto,
  CreateAppointmentRequest,
  CreateAppointmentRequestModalityEnum,
  FreeBusyDto,
  GuestDto,
  OverviewDto,
  PatientAppointmentsDto,
  PatientDto,
  PatientsService,
  RendezVousService,
  UpdateAppointmentRequest,
  UpdateAppointmentRequestModalityEnum,
  VueDensembleService,
} from '../../../api';
import {
  AgendaData,
  AgendaRange,
  ageOf,
  Appointment,
  AppointmentGuest,
  AppointmentModality,
  AppointmentOrigin,
  AppointmentPatch,
  AppointmentPreparation,
  AppointmentStatus,
  APPOINTMENT_MODALITIES,
  APPOINTMENT_ORIGINS,
  Conflict,
  CreatedAppointments,
  FreeBusy,
  NewAppointment,
  PatientAppointments,
  PatientOption,
  UpdatedAppointment,
} from './agenda.model';

/** Patients proposés par la recherche du panneau 15b. */
export const PATIENT_SEARCH_LIMIT = 8;

const STATUSES: readonly AppointmentStatus[] = ['planned', 'tentative', 'cancelled', 'done'];

/**
 * Service de données de features/agenda (handbook §2, couche 4) : seul fichier de la feature qui
 * importe `src/app/api` (contrat `contract-v0.15.0`, module `agenda` de psymate-api). Il traduit
 * les DTO en modèle de vue (agenda.model.ts) et rend des promesses ; les erreurs arrivent déjà en
 * ApiProblem (problem.interceptor). Dates en UTC ISO à l'aller comme au retour.
 */
@Injectable({ providedIn: 'root' })
export class AgendaApi {
  private readonly agenda = inject(AgendaService);
  private readonly appointments = inject(RendezVousService);
  private readonly patients = inject(PatientsService);
  private readonly overviews = inject(VueDensembleService);

  /** `GET /api/agenda?from&to` : rendez-vous actifs de la plage (62 jours au plus). */
  async load(range: AgendaRange): Promise<AgendaData> {
    const dto = await firstValueFrom(
      this.agenda.window(range.from.toISOString(), range.to.toISOString()),
    );
    return toAgendaData(dto);
  }

  /** `GET /api/agenda/freebusy` : conflits et voisinage d'un créneau. */
  async freeBusy(
    from: Date,
    to: Date,
    tz: string,
    excludeAppointmentId?: string,
  ): Promise<FreeBusy> {
    const dto = await firstValueFrom(
      this.agenda.freeBusy(from.toISOString(), to.toISOString(), excludeAppointmentId, tz),
    );
    return toFreeBusy(dto);
  }

  /** `GET /api/patients/{id}/appointments` : rendez-vous à venir et défauts du panneau 15b. */
  async patientAppointments(patientId: string): Promise<PatientAppointments> {
    return toPatientAppointments(await firstValueFrom(this.agenda.ofPatient(patientId)));
  }

  /** `POST /api/appointments` : une occurrence ou une série. */
  async create(request: NewAppointment): Promise<CreatedAppointments> {
    const dto = await firstValueFrom(this.appointments.createAppointment(toCreateRequest(request)));
    return {
      appointments: (dto.appointments ?? []).map(toAppointment),
      conflicts: (dto.conflicts ?? []).map(toConflict),
    };
  }

  /** `GET /api/appointments/{id}` (404 APPOINTMENT_NOT_FOUND). */
  async get(id: string): Promise<Appointment> {
    return toAppointment(await firstValueFrom(this.appointments.getAppointment(id)));
  }

  /** `PATCH /api/appointments/{id}` : fusion partielle (409 APPOINTMENT_NOT_ACTIVE). */
  async update(id: string, patch: AppointmentPatch): Promise<UpdatedAppointment> {
    const body: UpdateAppointmentRequest = {};
    if (patch.startsAt !== undefined) body.startsAt = patch.startsAt;
    if (patch.durationMin !== undefined) body.durationMin = patch.durationMin;
    if (patch.modality !== undefined) {
      body.modality = patch.modality as UpdateAppointmentRequestModalityEnum;
    }
    if (patch.planningNote !== undefined) body.planningNote = patch.planningNote;
    const dto = await firstValueFrom(this.appointments.updateAppointment(id, body));
    return {
      appointment: toAppointment(dto.appointment ?? {}),
      conflicts: (dto.conflicts ?? []).map(toConflict),
    };
  }

  /** `POST /api/appointments/{id}/cancel` : motif facultatif (500 caractères au plus). */
  async cancel(id: string, reason?: string): Promise<Appointment> {
    const body = reason ? { reason } : {};
    return toAppointment(await firstValueFrom(this.appointments.cancelAppointment(id, body)));
  }

  /** `POST /api/appointments/{id}/confirm` : à confirmer → planifié (409 sinon). */
  async confirm(id: string): Promise<Appointment> {
    return toAppointment(await firstValueFrom(this.appointments.confirmAppointment(id)));
  }

  /** `POST /api/appointments/series/{seriesId}/cancel` : « Annuler » du toast après une série. */
  async cancelSeries(seriesId: string, reason?: string): Promise<Appointment[]> {
    const body = reason ? { reason } : {};
    const dto = await firstValueFrom(this.appointments.cancelSeries(seriesId, body));
    return (dto.appointments ?? []).map(toAppointment);
  }

  /** `GET /api/patients?q=&archived=false` : patients actifs dont le nom correspond. */
  async searchPatients(query: string): Promise<PatientOption[]> {
    const page = await firstValueFrom(
      this.patients.listPatients(
        query.trim() || undefined,
        false,
        undefined,
        'name',
        undefined,
        PATIENT_SEARCH_LIMIT,
      ),
    );
    return (page.items ?? []).filter((item) => !item.archivedAt).map(toPatientOption);
  }

  /** Bloc « Préparer » : `GET /api/patients/{id}/overview` (projection existante). */
  async preparation(patientId: string): Promise<AppointmentPreparation> {
    return toPreparation(await firstValueFrom(this.overviews.getPatientOverview(patientId)));
  }
}

// ---------------------------------------------------------------------------------------------
// Traductions DTO → modèle de vue (exportées pour les tests).

function modalityOf(value: unknown): AppointmentModality {
  return APPOINTMENT_MODALITIES.includes(value as AppointmentModality)
    ? (value as AppointmentModality)
    : 'in_person';
}

/** Origine inconnue ou absente : posé par le praticien, la seule origine d'avant 0.15.0. */
function originOf(value: unknown): AppointmentOrigin {
  return APPOINTMENT_ORIGINS.includes(value as AppointmentOrigin)
    ? (value as AppointmentOrigin)
    : 'practitioner';
}

function statusOf(value: unknown): AppointmentStatus {
  return STATUSES.includes(value as AppointmentStatus) ? (value as AppointmentStatus) : 'planned';
}

/** Chaîne vide ou blanche → null (champs facultatifs de l'invité). */
function textOrNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Invité (`GuestDto`) : champs vides → null ; après la purge, seul `purgedAt` reste. */
export function toGuest(dto: GuestDto): AppointmentGuest {
  return {
    firstName: textOrNull(dto.firstName),
    lastName: textOrNull(dto.lastName),
    phone: textOrNull(dto.phone),
    email: textOrNull(dto.email),
    purgedAt: dto.purgedAt ?? null,
  };
}

/**
 * Rendez-vous : `patient` pour un patient, `guest` pour un invité (contrat 0.13.0, l'un ou
 * l'autre) ; un patient l'emporte si le serveur renvoyait les deux.
 */
export function toAppointment(dto: AppointmentDto): Appointment {
  const startsAt = dto.startsAt ?? '';
  const endsAt = dto.endsAt ?? startsAt;
  const durationMin =
    dto.durationMin ??
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  return {
    id: dto.id ?? '',
    patient: dto.patient
      ? {
          id: dto.patient.id ?? '',
          displayName: dto.patient.displayName ?? '',
          birthDate: dto.patient.birthDate ?? null,
          age: ageOf(dto.patient.birthDate),
          archived: dto.patient.archived ?? false,
        }
      : null,
    guest: !dto.patient && dto.guest ? toGuest(dto.guest) : null,
    origin: originOf(dto.origin),
    seriesId: dto.seriesId ?? null,
    startsAt,
    endsAt,
    durationMin,
    modality: modalityOf(dto.modality),
    status: statusOf(dto.status),
    planningNote: dto.planningNote ?? null,
    cancelReason: dto.cancelReason ?? null,
    cancelledAt: dto.cancelledAt ?? null,
    sessionEntryId: dto.sessionEntryId ?? null,
  };
}

export function toConflict(dto: ConflictDto): Conflict {
  return {
    appointmentId: dto.appointmentId ?? '',
    patientDisplayName: dto.patientDisplayName ?? '',
    startsAt: dto.startsAt ?? '',
    endsAt: dto.endsAt ?? '',
    occurrenceStartsAt: dto.occurrenceStartsAt ?? dto.startsAt ?? '',
  };
}

/** `busy` est réservé aux indisponibilités externes : toujours vide en V1, ignoré. */
export function toAgendaData(dto: AgendaWindowDto): AgendaData {
  return { appointments: (dto.appointments ?? []).map(toAppointment), busy: [] };
}

export function toFreeBusy(dto: FreeBusyDto): FreeBusy {
  return {
    conflicts: (dto.conflicts ?? []).map(toConflict),
    previous: dto.previous ? toAppointment(dto.previous) : null,
    next: dto.next ? toAppointment(dto.next) : null,
  };
}

export function toPatientAppointments(dto: PatientAppointmentsDto): PatientAppointments {
  return {
    appointments: (dto.appointments ?? []).map(toAppointment),
    defaults: {
      durationMin: dto.defaults?.durationMin ?? 60,
      modality: modalityOf(dto.defaults?.modality),
      rhythm: dto.defaults?.rhythm?.trim() || null,
    },
  };
}

export function toPatientOption(dto: PatientDto): PatientOption {
  return { id: dto.id ?? '', displayName: dto.displayName ?? '', age: ageOf(dto.birthDate) };
}

export function toPreparation(dto: OverviewDto): AppointmentPreparation {
  const entries = dto.sinceLastSession?.entries ?? [];
  const count = (type: string) => entries.filter((entry) => entry.type === type).length;
  const feelings = count('feeling');
  const events = count('event');
  return {
    lastSessionAt:
      dto.sinceLastSession?.lastSessionAt ?? dto.recentSessions?.[0]?.occurredFrom ?? null,
    feelings,
    events,
    others: entries.length - feelings - events,
    followedSince: dto.facts?.followedSince ?? null,
  };
}

export function toCreateRequest(request: NewAppointment): CreateAppointmentRequest {
  const body: CreateAppointmentRequest = {
    patientId: request.patientId,
    startsAt: request.startsAt,
    durationMin: request.durationMin,
    modality: request.modality as CreateAppointmentRequestModalityEnum,
    tentative: request.tentative,
    tz: request.tz,
  };
  const note = request.planningNote?.trim();
  if (note) body.planningNote = note;
  if (request.recurrence) {
    const { everyWeeks, count, until } = request.recurrence;
    body.recurrence = until ? { everyWeeks, until } : { everyWeeks, count: count ?? 1 };
  }
  return body;
}
