import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreatePatientRequest,
  CreatePatientRequestPronounEnum,
  FlagDto,
  FlagRequestKindEnum,
  OverviewDto,
  PatientDto,
  PatientsService,
  RecentSessionDtoKindEnum,
  TagsService,
  TagView,
  VersionDto,
  VueDensembleService,
} from '../../../api';
import { CursorPage } from '../../../shared/util';
import {
  FlagKind,
  PATIENT_PAGE_SIZE,
  PatientActivity,
  PatientCreateInput,
  PatientFlagView,
  PatientListQuery,
  PatientVersion,
  PatientView,
  PractitionerTag,
  SESSION_MODALITIES,
  SessionModality,
} from './patient.model';

/**
 * Service de données de features/patients (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré (Patients, Tags). Traduit les DTO en modèles de vue ; les erreurs
 * arrivent déjà en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class PatientApi {
  private readonly patients = inject(PatientsService);
  private readonly tagsApi = inject(TagsService);
  private readonly overviews = inject(VueDensembleService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /**
   * GET /api/patients : une page de PATIENT_PAGE_SIZE patients (décision 1 du 14 novembre 2026),
   * filtrée (q, archived, tag) et triée, par curseur opaque.
   */
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

  /**
   * Résumé d'une ligne de la liste : GET /api/patients/{id}/overview?window=30d (séances récentes,
   * séance ouverte, depuis la dernière séance, courbe et émotion dominante sur 30 j, situations en
   * cours, brouillons). La liste du contrat ne porte pas ces champs ; la projection est relue,
   * jamais recalculée dans le client.
   */
  async activity(id: string): Promise<PatientActivity> {
    return toActivity(
      await firstValueFrom(this.overviews.getPatientOverview(id, '30d')),
      this.english,
    );
  }

  /**
   * Nombre de séances non archivées du dossier, pour la méta de la fiche (« 31 séances ») : lu
   * dans les faits de la projection vue d'ensemble (facts.sessionCount), la fiche du contrat ne le
   * porte pas. null si la projection ne le donne pas.
   */
  async sessionCount(id: string): Promise<number | null> {
    const overview = await firstValueFrom(this.overviews.getPatientOverview(id, '30d'));
    return overview.facts?.sessionCount ?? null;
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

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** sinceLastSession.entries en compte au plus 20 (contrat) : « 20+ » au-delà. */
export const SINCE_ENTRIES_MAX = 20;

/**
 * Projection vue d'ensemble → résumé d'une ligne de la liste. Le ressenti le plus fort « depuis la
 * séance » croise les entrées de sinceLastSession avec feelings.points (même identifiant d'entrée) :
 * seuls les ressentis de la fenêtre de 30 jours portent leur intensité.
 */
export function toActivity(dto: OverviewDto, english = false): PatientActivity {
  const series = dto.feelings?.series ?? [];
  const labels = new Map<string, string>();
  for (const entry of series) {
    if (!entry.emotionCode) continue;
    const label = (english ? entry.labelEn : null) || entry.label || entry.emotionCode;
    labels.set(entry.emotionCode, label);
  }
  const points = dto.feelings?.points ?? [];
  const intensityOf = new Map<string, { code: string; intensity: number }>();
  for (const point of points) {
    if (point.entryId && point.emotionCode && typeof point.intensity === 'number') {
      intensityOf.set(point.entryId, { code: point.emotionCode, intensity: point.intensity });
    }
  }
  const sinceEntries = dto.sinceLastSession?.entries ?? [];
  let strongest: { label: string; intensity: number } | null = null;
  for (const entry of sinceEntries) {
    const feeling =
      entry.type === 'feeling' && entry.entryId ? intensityOf.get(entry.entryId) : null;
    if (feeling && (!strongest || feeling.intensity > strongest.intensity)) {
      strongest = { label: labels.get(feeling.code) ?? feeling.code, intensity: feeling.intensity };
    }
  }
  const top = (dto.emotions?.top ?? []).find((emotion) => !!emotion.code) ?? null;
  const last = (dto.recentSessions ?? []).find((session) => !!session.occurredFrom) ?? null;
  const closedAt = text(last?.closedAt);
  const situations = dto.activeSituations ?? [];
  // La séance d'accueil est créée avec le patient et jamais clôturée ; le contrat dit qu'elle ne
  // compte pas comme séance ouverte (sessions/current, start). La projection la renvoie pourtant
  // dans drafts.openSession : on l'écarte par son genre, lu dans recentSessions.
  const open = dto.drafts?.openSession ?? null;
  const openIsIntake =
    !!open?.entryId &&
    (dto.recentSessions ?? []).some(
      (s) => s.entryId === open.entryId && s.kind === RecentSessionDtoKindEnum.Intake,
    );
  return {
    lastSession: last
      ? {
          at: last.occurredFrom!,
          closedAt,
          modality: oneOf<SessionModality>(last.modality, SESSION_MODALITIES),
          entryCount: last.entryCount ?? 0,
          reportMissing: closedAt !== null && !(last.summary ?? '').trim(),
        }
      : null,
    openSessionAt: openIsIntake ? null : text(open?.startedAt),
    since: {
      entries: sinceEntries.length,
      capped: sinceEntries.length >= SINCE_ENTRIES_MAX,
      strongest,
    },
    intensities: (dto.trend?.points ?? []).map((point) =>
      typeof point.averageIntensity === 'number' ? point.averageIntensity : null,
    ),
    feelingCount: points.length,
    dominant: top
      ? {
          label: (english ? labels.get(top.code!) : null) || top.label || top.code!,
          delta: top.delta ?? 0,
        }
      : null,
    situations: { count: situations.length, first: text(situations[0]?.title) },
    drafts: dto.drafts?.count ?? 0,
    followedSince: text(dto.facts?.followedSince),
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
