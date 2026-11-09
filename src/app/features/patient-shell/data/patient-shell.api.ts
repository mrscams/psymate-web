import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  EntryDto,
  PatientDto,
  PatientsService,
  RecordContactRequestModalityEnum,
  SeancesService,
  StartSessionRequestModalityEnum,
} from '../../../api';
import { isApiProblem } from '../../../core/http';
import {
  CloseSessionInput,
  ContactInput,
  FlagKind,
  SessionModality,
  ShellPatient,
  ShellSession,
} from './patient-shell.model';

/**
 * Service de données de features/patient-shell (handbook §2, couche 4) : le seul fichier de la
 * feature qui importe le client généré (Patients pour l'en-tête, Séances, Chronologie pour l'indice
 * de première entrée). Traduit les DTO en
 * modèles de vue ; les erreurs arrivent déjà en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class PatientShellApi {
  private readonly patients = inject(PatientsService);
  private readonly sessions = inject(SeancesService);
  private readonly timeline = inject(ChronologieService);

  /** GET /api/patients/{id} (403 PATIENT_FORBIDDEN, 404 PATIENT_NOT_FOUND pour l'écran). */
  async patient(id: string): Promise<ShellPatient> {
    return toPatient(await firstValueFrom(this.patients.getPatient(id)));
  }

  /**
   * GET /api/patients/{id}/sessions/current : séance ouverte, sinon dernière séance ou dernier
   * contact clôturé, sinon accueil. 404 NO_CURRENT_SESSION (aucune séance, l'accueil arrive en
   * différé) → null.
   */
  async current(patientId: string): Promise<ShellSession | null> {
    try {
      return toSession(await firstValueFrom(this.sessions.getCurrentSession(patientId)));
    } catch (error) {
      if (isApiProblem(error) && error.code === 'NO_CURRENT_SESSION') return null;
      throw error;
    }
  }

  /**
   * Le dossier a-t-il au moins une entrée saisie (hors séances, dont l'accueil créé avec le
   * patient) ? GET /api/patients/{id}/timeline/summary par année (un agrégat léger, sans
   * pagination), brouillons et entrées privées compris (M7-03 : indice « première entrée »). La
   * chronologie elle-même n'est pas lue : son chargement reste celui de l'onglet Timeline.
   */
  async hasEntries(patientId: string): Promise<boolean> {
    const summary = await firstValueFrom(
      this.timeline.getTimelineSummary(patientId, 'year', undefined, undefined, true),
    );
    return (summary.periods ?? []).some((period) =>
      Object.entries(period.counts ?? {}).some(([type, count]) => type !== 'session' && count > 0),
    );
  }

  /** POST /api/patients/{id}/sessions/start → 201, la séance ouverte (409 SESSION_ALREADY_OPEN). */
  async start(patientId: string, modality: SessionModality): Promise<ShellSession> {
    const dto = await firstValueFrom(
      this.sessions.startSession(patientId, {
        modality: modality as StartSessionRequestModalityEnum,
      }),
    );
    return toSession(dto);
  }

  /** POST /api/sessions/{id}/close → 200, la séance clôturée (409 SESSION_ALREADY_CLOSED, 422). */
  async close(sessionId: string, input: CloseSessionInput): Promise<ShellSession> {
    const body: CloseSessionInput = {};
    if (input.durationMin !== undefined) body.durationMin = input.durationMin;
    if (input.summary) body.summary = input.summary;
    return toSession(await firstValueFrom(this.sessions.closeSession(sessionId, body)));
  }

  /** POST /api/patients/{id}/sessions/contact → 201, le contact (séance déjà clôturée). */
  async contact(patientId: string, input: ContactInput): Promise<ShellSession> {
    const dto = await firstValueFrom(
      this.sessions.recordContact(patientId, {
        ...input,
        modality: input.modality as RecordContactRequestModalityEnum,
      }),
    );
    return toSession(dto);
  }
}

function toPatient(dto: PatientDto): ShellPatient {
  const since = dto.followUp?.['since'];
  return {
    id: dto.id ?? '',
    displayName: dto.displayName ?? '',
    birthDate: dto.birthDate ?? null,
    followedSince: typeof since === 'string' && since ? since : (dto.createdAt ?? null),
    flags: (dto.flags ?? [])
      .map((flag) => flag.kind as FlagKind | undefined)
      .filter((kind): kind is FlagKind => !!kind),
    sessionModality: toModality(dto.followUp?.['modality']),
  };
}

const SESSION_MODALITIES: readonly SessionModality[] = ['in_person', 'video', 'phone', 'email'];

/** followUp.modality (texte libre côté contrat) si c'est une modalité de séance, sinon présentiel. */
function toModality(value: unknown): SessionModality {
  return SESSION_MODALITIES.find((modality) => modality === value) ?? 'in_person';
}

function toSession(dto: EntryDto): ShellSession {
  return {
    id: dto.id ?? '',
    kind: dto.session?.kind ?? 'session',
    startedAt: dto.occurred?.from ?? dto.recordedAt ?? '',
    closedAt: dto.session?.closedAt ?? null,
    durationMin: dto.session?.durationMin ?? null,
    summary: dto.body ?? null,
  };
}
