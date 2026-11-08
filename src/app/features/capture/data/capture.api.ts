import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  CreateEmotionRequestFamilyEnum,
  CreateEntryRequest,
  EmotionsPersonnellesService,
  EmotionView,
  EntreesService,
  LinkTypeView,
  TimelineItemDto,
  VocabulaireService,
} from '../../../api';
import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import {
  CreateEntryBody,
  EMOTION_FAMILIES,
  EmotionFamily,
  LinkCandidate,
  railCandidates,
} from '../../entries';
import { LinkTypeCode, LinkTypeOption } from '../../graph';
import { CaptureEmotion, CapturedEntry } from './capture.model';

/** Entrées récentes lues pour le rail : de quoi en garder cinq après les situations en cours. */
const RECENT_LIMIT = 10;

/** Cibles du rail : le contenu clinique récent, pas les séances (comme l'éditeur d'entrée, M2-05). */
const RAIL_TYPES: readonly EntryType[] = ['note', 'event', 'situation', 'feeling', 'medication'];

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

/**
 * Service de données de features/capture (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré. Vocabulaire des émotions (le parseur et la pastille de famille),
 * catalogue des types de liens et cibles du rail (chronologie), création d'une entrée et d'une
 * émotion personnalisée. Les erreurs arrivent déjà en ApiProblem (core/http) ; les corps viennent de
 * toCreateBody (features/entries) et ne portent jamais authorType ni submissionId (A11).
 */
@Injectable({ providedIn: 'root' })
export class CaptureApi {
  private readonly entries = inject(EntreesService);
  private readonly timeline = inject(ChronologieService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly customEmotions = inject(EmotionsPersonnellesService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /** GET /api/vocabulary/emotions : 29 globales et personnalisées actives du praticien. */
  async emotions(): Promise<CaptureEmotion[]> {
    const list = await firstValueFrom(this.vocabulary.emotions());
    return list
      .filter((emotion) => emotion.active !== false && !!emotion.code)
      .map((emotion) => toEmotion(emotion, this.english));
  }

  /** POST /api/me/emotions → 201 (409 EMOTION_LABEL_EXISTS, 422 labelFr / family). */
  async createEmotion(label: string, family: EmotionFamily): Promise<CaptureEmotion> {
    const dto = await firstValueFrom(
      this.customEmotions.create1({
        labelFr: label,
        family: family as CreateEmotionRequestFamilyEnum,
      }),
    );
    return toEmotion(dto, this.english);
  }

  /** GET /api/vocabulary/link-types : les huit types et leur matrice (E5.3), ordre du catalogue. */
  async linkTypes(): Promise<LinkTypeOption[]> {
    const list = await firstValueFrom(this.vocabulary.linkTypes());
    return list.map((view) => toLinkType(view, this.english));
  }

  /**
   * GET /api/patients/{id}/timeline : les cinq cibles du rail « Lié à… » (situations en cours, puis
   * entrées récentes hors séances, brouillons compris, privées exclues : défaut du contrat).
   */
  async railCandidates(patientId: string): Promise<LinkCandidate[]> {
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
    const situations = (page.ongoingSituations ?? []).filter((item) => !!item.id).map(toCandidate);
    const recent = (page.items ?? [])
      .filter((item) => !!item.id && item.type !== 'session')
      .map(toCandidate);
    return railCandidates(situations, recent);
  }

  /**
   * POST /api/patients/{id}/entries → 201 (422 VALIDATION_FAILED, SESSION_REQUIRED, liens refusés ;
   * 409). Sans sessionId : la séance courante du patient.
   */
  async create(patientId: string, body: CreateEntryBody): Promise<CapturedEntry> {
    const dto = await firstValueFrom(
      this.entries.createEntry(patientId, body as unknown as CreateEntryRequest),
    );
    return {
      id: dto.id ?? '',
      type: oneOf(ENTRY_TYPES, dto.type, body.type),
      status: dto.status === 'draft' ? 'draft' : 'final',
      sessionId: dto.sessionId ?? null,
    };
  }
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((item) => item === value) ?? fallback;
}

/** Libellé affiché dans la langue de l'interface ; le parseur compare labelFr, labelEn et le code. */
function toEmotion(dto: EmotionView, english: boolean): CaptureEmotion {
  const labelFr = dto.labelFr ?? dto.code ?? '';
  return {
    code: dto.code ?? '',
    labelFr,
    labelEn: dto.labelEn ?? null,
    label: (english ? dto.labelEn : null) || labelFr,
    family: EMOTION_FAMILIES.find((item) => item === dto.family) ?? null,
    custom: dto.scope === 'custom',
  };
}

function toCandidate(item: TimelineItemDto): LinkCandidate {
  return {
    id: item.id ?? '',
    type: oneOf(ENTRY_TYPES, item.type, 'note'),
    title: item.title?.trim() || null,
    emotionCode: item.emotion?.code ?? null,
    intensity: item.intensity ?? null,
    occurred: {
      from: item.occurred?.from ?? null,
      to: item.occurred?.to ?? null,
      precision: oneOf(PRECISIONS, item.occurred?.precision, 'exact'),
      label: item.occurred?.label ?? null,
    },
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
