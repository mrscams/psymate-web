import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  CreateEmotionRequestFamilyEnum,
  CreateEntryRequest,
  EmotionsPersonnellesService,
  EmotionView,
  EntreesService,
  EntryDto,
  EntryVersionDto,
  LiensService,
  LinkDto,
  LinkTypeView,
  PatchEntryRequest,
  PatientsService,
  SeancesService,
  TagsService,
  TimelineItemDto,
  VocabulaireService,
} from '../../../api';
import { isApiProblem } from '../../../core/http';
import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import { LinkTypeCode, LinkTypeOption } from '../../graph';
import {
  CreateEntryBody,
  Emotion,
  EmotionFamily,
  EMOTION_FAMILIES,
  EntryStatus,
  EntryVersion,
  EntryView,
  EntryVisibility,
  LinkCandidate,
  PatchEntryBody,
  PlacedLink,
  SessionModality,
  SessionOption,
  SESSION_MODALITIES,
} from './entry.model';

/** Au plus 200 séances listées dans le bloc Séance (limite de la chronologie). */
const SESSIONS_LIMIT = 200;

/**
 * Entrées récentes lues pour le rail « Lié à… » : de quoi en garder cinq une fois retirées les
 * situations en cours déjà proposées en tête.
 */
const RECENT_LIMIT = 10;

/**
 * Types des cibles du rail : pas de séance (l'entrée appartient déjà à sa séance par sessionId ; le
 * rail propose le contenu clinique récent).
 */
const RAIL_TYPES: readonly EntryType[] = ['note', 'event', 'situation', 'feeling', 'medication'];

/** Cibles du rail telles que la chronologie les rend, avant le tri du modèle (railCandidates). */
export interface RailSource {
  /** ongoingSituations de la chronologie (terminées comprises : ongoing les distingue). */
  situations: LinkCandidate[];
  /** items, de la plus récente à la plus ancienne. */
  recent: LinkCandidate[];
}

/**
 * Service de données de features/entries (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré (Entrées, Séances, Chronologie pour la liste des séances,
 * Vocabulaire, Émotions personnelles, Tags). Traduit les DTO en modèles de vue ; les erreurs
 * arrivent déjà en ApiProblem (core/http). Les corps envoyés sont construits par entry.model.ts et
 * ne portent jamais authorType ni submissionId (A11).
 */
@Injectable({ providedIn: 'root' })
export class EntriesApi {
  private readonly entries = inject(EntreesService);
  private readonly sessions = inject(SeancesService);
  private readonly timeline = inject(ChronologieService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly customEmotions = inject(EmotionsPersonnellesService);
  private readonly tags = inject(TagsService);
  private readonly links = inject(LiensService);
  private readonly patients = inject(PatientsService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /** POST /api/patients/{id}/entries → 201 (422 VALIDATION_FAILED, SESSION_REQUIRED ; 409 SESSION_ALREADY_OPEN). */
  async create(patientId: string, body: CreateEntryBody): Promise<EntryView> {
    const dto = await firstValueFrom(
      this.entries.createEntry(patientId, body as unknown as CreateEntryRequest),
    );
    return toEntry(dto);
  }

  /** PATCH /api/entries/{id} → 200, l'entrée corrigée (409 ENTRY_ARCHIVED, 422). */
  async patch(entryId: string, body: PatchEntryBody): Promise<EntryView> {
    const dto = await firstValueFrom(
      this.entries.patchEntry(entryId, body as unknown as PatchEntryRequest),
    );
    return toEntry(dto);
  }

  /** GET /api/entries/{id} (404 ENTRY_NOT_FOUND, 403 PATIENT_FORBIDDEN). */
  async get(entryId: string): Promise<EntryView> {
    return toEntry(await firstValueFrom(this.entries.getEntry(entryId)));
  }

  /** GET /api/entries/{id}/versions : toutes, la plus récente en premier. */
  async versions(entryId: string): Promise<EntryVersion[]> {
    const list = await firstValueFrom(this.entries.listEntryVersions(entryId));
    return list.map(toVersion);
  }

  /** GET /api/patients/{id} : le nom affiché, pour le sous-titre du panneau (« Marie D. · … »). */
  async patientName(patientId: string): Promise<string> {
    const dto = await firstValueFrom(this.patients.getPatient(patientId));
    return dto.displayName?.trim() ?? '';
  }

  /** GET /api/vocabulary/emotions : 29 globales + personnalisées actives du praticien. */
  async emotions(): Promise<Emotion[]> {
    const list = await firstValueFrom(this.vocabulary.emotions());
    return list
      .filter((emotion) => emotion.active !== false)
      .map((emotion) => toEmotion(emotion, this.english));
  }

  /** POST /api/me/emotions → 201 (409 EMOTION_LABEL_EXISTS, 422 labelFr / family). */
  async createEmotion(label: string, family: EmotionFamily): Promise<Emotion> {
    const dto = await firstValueFrom(
      this.customEmotions.create1({
        labelFr: label,
        family: family as CreateEmotionRequestFamilyEnum,
      }),
    );
    return toEmotion(dto, this.english);
  }

  /** GET /api/vocabulary/link-types : les huit types et leur matrice (E5.3), dans l'ordre du catalogue. */
  async linkTypes(): Promise<LinkTypeOption[]> {
    const list = await firstValueFrom(this.vocabulary.linkTypes());
    return list.map((view) => toLinkType(view, this.english));
  }

  /**
   * GET /api/patients/{id}/timeline : les cibles du rail « Lié à… », situations en cours et entrées
   * récentes (hors séances), brouillons compris, entrées privées exclues (défaut du contrat).
   */
  async railSource(patientId: string): Promise<RailSource> {
    const page = await firstValueFrom(
      this.timeline.getTimeline(
        patientId,
        undefined,
        undefined,
        [...RAIL_TYPES],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        RECENT_LIMIT,
      ),
    );
    return {
      situations: (page.ongoingSituations ?? []).filter((item) => !!item.id).map(toCandidate),
      recent: (page.items ?? [])
        .filter((item) => !!item.id && item.type !== 'session')
        .map(toCandidate),
    };
  }

  /** GET /api/entries/{id}/links : liens acceptés de l'entrée, vus depuis elle (correction). */
  async linksOf(entryId: string): Promise<PlacedLink[]> {
    const list = await firstValueFrom(this.links.listEntryLinks(entryId));
    return list.map(toPlacedLink);
  }

  /** GET /api/tags : libellés des tags actifs du praticien (choix des tags existants). */
  async tagLabels(): Promise<string[]> {
    const list = await firstValueFrom(this.tags.list());
    return list.map((tag) => tag.label ?? '').filter((label) => !!label);
  }

  /**
   * GET /api/patients/{id}/sessions/current : séance ouverte, sinon dernière clôturée, sinon
   * accueil ; 404 NO_CURRENT_SESSION → null.
   */
  async currentSession(patientId: string): Promise<SessionOption | null> {
    try {
      const dto = await firstValueFrom(this.sessions.getCurrentSession(patientId));
      return {
        id: dto.id ?? '',
        startedAt: dto.occurred?.from ?? dto.recordedAt ?? '',
        open: dto.session?.kind !== 'intake' && !dto.session?.closedAt,
      };
    } catch (error) {
      if (isApiProblem(error) && error.code === 'NO_CURRENT_SESSION') return null;
      throw error;
    }
  }

  /** Séances du patient (GET …/timeline?types=session), la plus récente en premier. */
  async sessionsOf(patientId: string): Promise<SessionOption[]> {
    const page = await firstValueFrom(
      this.timeline.getTimeline(
        patientId,
        undefined,
        undefined,
        ['session'],
        undefined,
        undefined,
        undefined,
        true,
        undefined,
        SESSIONS_LIMIT,
      ),
    );
    return (page.items ?? [])
      .filter((item) => !!item.id)
      .map((item) => ({
        id: item.id ?? '',
        startedAt: item.occurred?.from ?? item.recordedAt ?? '',
        open: false,
      }));
  }
}

const ENTRY_TYPES: readonly EntryType[] = [
  'note',
  'event',
  'situation',
  'feeling',
  'session',
  'medication',
];
const PRECISIONS: readonly OccurredPrecision[] = [
  'exact',
  'day',
  'month',
  'year',
  'period',
  'life_phase',
];

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((item) => item === value) ?? fallback;
}

function toEntry(dto: EntryDto): EntryView {
  const modality = dto.session?.modality;
  return {
    id: dto.id ?? '',
    patientId: dto.patientId ?? '',
    type: oneOf(ENTRY_TYPES, dto.type, 'note'),
    status: (dto.status === 'draft' ? 'draft' : 'final') as EntryStatus,
    visibility: (dto.visibility === 'private' ? 'private' : 'clinical') as EntryVisibility,
    title: dto.title ?? null,
    body: dto.body ?? null,
    occurred: toOccurred(dto.occurred),
    recordedAt: dto.recordedAt ?? null,
    sessionId: dto.sessionId ?? null,
    version: dto.version ?? 1,
    tags: dto.tags ?? [],
    linkCount: dto.linkCount ?? 0,
    feeling: dto.feeling
      ? { emotionCode: dto.feeling.emotionCode ?? null, intensity: dto.feeling.intensity ?? null }
      : null,
    medication: dto.medication
      ? { molecule: dto.medication.molecule ?? null, dosage: dto.medication.dosage ?? null }
      : null,
    session: dto.session
      ? {
          modality: modality
            ? (oneOf(SESSION_MODALITIES, modality, 'in_person') as SessionModality)
            : null,
          durationMin: dto.session.durationMin ?? null,
          closedAt: dto.session.closedAt ?? null,
        }
      : null,
    archived: !!dto.archivedAt,
  };
}

function toOccurred(dto: EntryDto['occurred']): EntryView['occurred'] {
  return {
    from: dto?.from ?? null,
    to: dto?.to ?? null,
    precision: oneOf(PRECISIONS, dto?.precision, 'exact'),
    label: dto?.label ?? null,
  };
}

function toCandidate(item: TimelineItemDto): LinkCandidate {
  return {
    id: item.id ?? '',
    type: oneOf(ENTRY_TYPES, item.type, 'note'),
    title: item.title?.trim() || null,
    emotionCode: item.emotion?.code ?? null,
    intensity: item.intensity ?? null,
    occurred: toOccurred(item.occurred),
    ongoing: item.ongoing === true,
  };
}

function entryTypes(values: string[] | undefined): EntryType[] {
  return (values ?? []).filter((value): value is EntryType =>
    ENTRY_TYPES.includes(value as EntryType),
  );
}

/** Libellés dans la langue de l'interface (labelEn / inverseLabelEn en anglais). */
function toLinkType(view: LinkTypeView, english: boolean): LinkTypeOption {
  const label = (english ? view.labelEn : view.labelFr) ?? view.labelFr ?? view.code ?? '';
  const inverse = (english ? view.inverseLabelEn : view.inverseLabelFr) ?? view.inverseLabelFr;
  return {
    code: view.code as LinkTypeCode,
    directed: view.directed ?? true,
    label,
    inverseLabel: inverse ?? null,
    sources: entryTypes(view.allowedSourceTypes),
    targets: entryTypes(view.allowedTargetTypes),
    lineStyle: (view.lineStyle as LinkTypeOption['lineStyle'] | undefined) ?? 'solid',
  };
}

function toPlacedLink(dto: LinkDto): PlacedLink {
  return {
    id: dto.id ?? '',
    linkType: dto.linkType as LinkTypeCode,
    label: dto.label ?? '',
    sentence: dto.sentence ?? '',
  };
}

function toVersion(dto: EntryVersionDto): EntryVersion {
  return {
    version: dto.version ?? 1,
    title: dto.title ?? null,
    body: dto.body ?? null,
    reason: dto.reason ?? null,
    authorId: dto.authorId ?? null,
    createdAt: dto.createdAt ?? null,
  };
}

/** Libellé dans la langue de l'interface ; une émotion personnalisée n'a que labelFr. */
function toEmotion(dto: EmotionView, english = false): Emotion {
  const family = EMOTION_FAMILIES.find((item) => item === dto.family) ?? null;
  return {
    code: dto.code ?? '',
    label: (english ? dto.labelEn : null) || dto.labelFr || dto.code || '',
    family,
    custom: dto.scope === 'custom',
    intensityLevel: dto.intensityLevel ?? null,
  };
}
