import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreatePatientRequest,
  CreatePatientRequestPronounEnum,
  FlagDto,
  FlagRequestKindEnum,
  PatientDto,
  PatientsService,
  TagsService,
  TagView,
  VersionDto,
} from '../../../api';
import { CursorPage } from '../../../shared/util';
import {
  FlagKind,
  PatientCreateInput,
  PatientFlagView,
  PatientListQuery,
  PatientVersion,
  PatientView,
  PractitionerTag,
} from './patient.model';

/** Taille d'une page de la liste (le contrat accepte 1..200, 50 par défaut). */
export const PATIENT_PAGE_SIZE = 50;

/**
 * Service de données de features/patients (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré (Patients, Tags). Traduit les DTO en modèles de vue ; les erreurs
 * arrivent déjà en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class PatientApi {
  private readonly patients = inject(PatientsService);
  private readonly tagsApi = inject(TagsService);

  /** GET /api/patients : une page, filtrée (q, archived, tag) et triée, par curseur opaque. */
  async list(query: PatientListQuery): Promise<CursorPage<PatientView>> {
    const page = await firstValueFrom(
      this.patients.listPatients(
        query.q || undefined,
        query.archived,
        query.tag ?? undefined,
        query.sort,
        query.cursor ?? undefined,
        PATIENT_PAGE_SIZE,
      ),
    );
    return { items: (page.items ?? []).map(toView), nextCursor: page.nextCursor ?? null };
  }

  /** GET /api/patients/{id} (fonctionne aussi pour un patient archivé). */
  async get(id: string): Promise<PatientView> {
    return toView(await firstValueFrom(this.patients.getPatient(id)));
  }

  /** POST /api/patients → 201 avec la fiche complète. */
  async create(input: PatientCreateInput): Promise<PatientView> {
    const body: CreatePatientRequest = {
      ...input,
      pronoun: input.pronoun as CreatePatientRequestPronounEnum | undefined,
      flags: input.flags?.map((flag) => ({
        kind: flag.kind as FlagRequestKindEnum,
        reason: flag.reason,
      })),
    };
    return toView(await firstValueFrom(this.patients.createPatient(body)));
  }

  /** PATCH /api/patients/{id} : clés présentes seulement ; crée une version. */
  async patch(id: string, changes: Record<string, unknown>): Promise<PatientView> {
    return toView(await firstValueFrom(this.patients.patchPatient(id, changes)));
  }

  /** DELETE /api/patients/{id} : archivage logique, 204. */
  async archive(id: string): Promise<void> {
    await firstValueFrom(this.patients.archivePatient(id));
  }

  /** POST /api/patients/{id}/restore → fiche restaurée. */
  async restore(id: string): Promise<PatientView> {
    return toView(await firstValueFrom(this.patients.restorePatient(id)));
  }

  /** GET /api/patients/{id}/versions : de la plus ancienne à la plus récente. */
  async versions(id: string): Promise<PatientVersion[]> {
    const list = await firstValueFrom(this.patients.listPatientVersions(id));
    return list.map(toVersion);
  }

  /** POST /api/patients/{id}/flags → fiche complète. */
  async addFlag(id: string, kind: FlagKind, reason?: string): Promise<PatientView> {
    return toView(
      await firstValueFrom(
        this.patients.addPatientFlag(id, { kind: kind as FlagRequestKindEnum, reason }),
      ),
    );
  }

  /** DELETE /api/patients/{id}/flags/{kind} → fiche complète. */
  async clearFlag(id: string, kind: FlagKind): Promise<PatientView> {
    return toView(await firstValueFrom(this.patients.clearPatientFlag(id, kind)));
  }

  /** PUT /api/patients/{id}/tags : remplace la liste (libellés de tags existants). */
  async replaceTags(id: string, labels: string[]): Promise<PatientView> {
    return toView(await firstValueFrom(this.patients.replacePatientTags(id, { tags: labels })));
  }

  /** GET /api/tags : tags actifs du praticien, pour l'autocomplétion. */
  async listTags(): Promise<PractitionerTag[]> {
    const tags = await firstValueFrom(this.tagsApi.list());
    return tags.map(toTag);
  }

  /** POST /api/tags : 422 TAG_IS_EMOTION, 409 TAG_EXISTS. */
  async createTag(label: string): Promise<PractitionerTag> {
    return toTag(await firstValueFrom(this.tagsApi.create({ label })));
  }
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const number = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

export function toView(dto: PatientDto): PatientView {
  const context = dto.context ?? {};
  const followUp = dto.followUp ?? {};
  return {
    id: dto.id ?? '',
    displayName: dto.displayName ?? '',
    firstName: text(dto.firstName),
    lastName: text(dto.lastName),
    birthDate: text(dto.birthDate),
    pronoun: text(dto.pronoun),
    phone: text(dto.phone),
    email: text(dto.email),
    context: {
      situation: text(context['situation']),
      activity: text(context['activity']),
      referredBy: text(context['referredBy']),
      initialReason: text(context['initialReason']),
      history: text(context['history']),
    },
    followUp: {
      since: text(followUp['since']),
      rhythm: text(followUp['rhythm']),
      modality: text(followUp['modality']),
      durationMin: number(followUp['durationMin']),
      fee: text(followUp['fee']),
      prescriber: text(followUp['prescriber']),
    },
    flags: (dto.flags ?? []).filter((flag) => !!flag.kind).map(toFlag),
    tags: (dto.tags ?? []).map((tag) => ({ id: tag.id ?? '', label: tag.label ?? '' })),
    currentVersion: dto.currentVersion ?? 1,
    archivedAt: text(dto.archivedAt),
    createdAt: text(dto.createdAt),
    updatedAt: text(dto.updatedAt),
  };
}

function toFlag(dto: FlagDto): PatientFlagView {
  return { kind: dto.kind as FlagKind, reason: text(dto.reason), setAt: text(dto.setAt) };
}

function toTag(dto: TagView): PractitionerTag {
  return {
    id: dto.id ?? '',
    label: dto.label ?? '',
    normalizedLabel: dto.normalizedLabel ?? (dto.label ?? '').toLocaleLowerCase(),
  };
}

function toVersion(dto: VersionDto): PatientVersion {
  return {
    version: dto.version ?? 0,
    createdAt: text(dto.createdAt),
    reason: text(dto.reason),
    snapshot: dto.snapshot ?? {},
  };
}
