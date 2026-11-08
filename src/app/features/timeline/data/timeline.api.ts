import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  EntreesService,
  EntryDto,
  TimelineItemDto,
  TimelinePageDto,
  VocabulaireService,
} from '../../../api';
import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import { SessionDetail, SessionKind, SessionModality } from './timeline-sessions.model';
import {
  EMOTION_FAMILIES,
  EmotionFamily,
  EmotionVocabulary,
  TimelineFacets,
  TimelineItem,
  TimelinePage,
  TimelineQuery,
  WINDOW_SIZE,
} from './timeline.model';

/** Séances lues pour l'index (pastille, début du suivi) : au plus 5 pages de 200. */
const SESSION_PAGES = 5;

/** Une liste vide n'est pas envoyée (absent = sans filtre, contrat). */
function list<T>(values: readonly T[]): T[] | undefined {
  return values.length ? [...values] : undefined;
}

/**
 * Service de données de features/timeline (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré (Chronologie ; Entrées pour le détail d'une séance ; Vocabulaire
 * pour le nom des émotions). Traduit les DTO en modèles de vue ; les erreurs arrivent déjà en
 * ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class TimelineApi {
  private readonly timeline = inject(ChronologieService);
  private readonly entries = inject(EntreesService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /**
   * GET /api/patients/{id}/timeline : une fenêtre (page keyset) de la chronologie filtrée (types,
   * emotions, tags, draftsOnly, période), ses facettes et les situations qui chevauchent la plage.
   * Entrées privées exclues (includePrivate absent : le filtre est serveur, jamais client).
   */
  async page(patientId: string, query: TimelineQuery): Promise<TimelinePage> {
    const dto = await firstValueFrom(
      this.timeline.getTimeline(
        patientId,
        query.from ?? undefined,
        query.to ?? undefined,
        list(query.types),
        list(query.emotions),
        list(query.tags),
        query.draftsOnly ? true : undefined,
        undefined,
        query.cursor ?? undefined,
        query.limit,
      ),
    );
    return toPage(dto);
  }

  /**
   * Index des séances du dossier (GET …/timeline?types=session) : identifiant → début. Sert à la
   * pastille « dit en séance du … » et au début du suivi, quelle que soit la fenêtre affichée.
   */
  async sessions(patientId: string): Promise<Record<string, string>> {
    const index: Record<string, string> = {};
    let cursor: string | undefined;
    for (let page = 0; page < SESSION_PAGES; page++) {
      const dto = await firstValueFrom(
        this.timeline.getTimeline(
          patientId,
          undefined,
          undefined,
          ['session'],
          undefined,
          undefined,
          undefined,
          undefined,
          cursor,
          WINDOW_SIZE,
        ),
      );
      for (const item of dto.items ?? []) {
        if (item.id && item.occurred?.from) index[item.id] = item.occurred.from;
      }
      if (!dto.nextCursor) break;
      cursor = dto.nextCursor;
    }
    return index;
  }

  /**
   * GET /api/entries/{id} d'une séance : horaires, durée, modalité, genre, clôture et compte rendu
   * (texte de la version courante, figé à la clôture), pour la séance dépliée du mode par séance.
   */
  async sessionDetail(sessionId: string): Promise<SessionDetail> {
    return toSessionDetail(await firstValueFrom(this.entries.getEntry(sessionId)));
  }

  /**
   * GET /api/vocabulary/emotions : code → libellé dans la langue de l'interface, et code → famille
   * (pastille des puces d'émotion, dont les facettes ne donnent que le code).
   */
  async emotions(): Promise<EmotionVocabulary> {
    const list = await firstValueFrom(this.vocabulary.emotions());
    const labels: Record<string, string> = {};
    const families: Record<string, EmotionFamily> = {};
    for (const emotion of list) {
      if (!emotion.code) continue;
      labels[emotion.code] =
        (this.english ? emotion.labelEn : null) || emotion.labelFr || emotion.code;
      const family = EMOTION_FAMILIES.find((value) => value === emotion.family);
      if (family) families[emotion.code] = family;
    }
    return { labels, families };
  }
}

function toSessionDetail(dto: EntryDto): SessionDetail {
  return {
    id: dto.id ?? '',
    from: dto.occurred?.from ?? null,
    to: dto.occurred?.to ?? null,
    durationMin: dto.session?.durationMin ?? null,
    modality: (dto.session?.modality ?? null) as SessionModality | null,
    kind: (dto.session?.kind ?? null) as SessionKind | null,
    closedAt: dto.session?.closedAt ?? null,
    summary: dto.body?.trim() || null,
  };
}

function toPage(dto: TimelinePageDto): TimelinePage {
  return {
    items: (dto.items ?? []).map(toItem),
    facets: toFacets(dto),
    ongoingSituations: (dto.ongoingSituations ?? []).map(toItem),
    nextCursor: dto.nextCursor ?? null,
  };
}

function toFacets(dto: TimelinePageDto): TimelineFacets {
  return {
    types: { ...(dto.facets?.types ?? {}) },
    emotions: { ...(dto.facets?.emotions ?? {}) },
    tags: { ...(dto.facets?.tags ?? {}) },
  };
}

export function toItem(dto: TimelineItemDto): TimelineItem {
  const family = EMOTION_FAMILIES.find((value) => value === dto.emotion?.family) ?? null;
  return {
    id: dto.id ?? '',
    type: (dto.type ?? 'note') as EntryType,
    title: dto.title?.trim() || null,
    status: dto.status === 'draft' ? 'draft' : 'final',
    visibility: dto.visibility === 'private' ? 'private' : 'clinical',
    authorType: dto.authorType ?? 'practitioner',
    occurred: {
      from: dto.occurred?.from ?? null,
      to: dto.occurred?.to ?? null,
      precision: (dto.occurred?.precision ?? 'exact') as OccurredPrecision,
      label: dto.occurred?.label ?? null,
    },
    recordedAt: dto.recordedAt ?? null,
    sessionId: dto.sessionId ?? null,
    emotion: dto.emotion?.code ? { code: dto.emotion.code, family } : null,
    intensity: dto.intensity ?? null,
    tags: dto.tags ?? [],
    linkCount: dto.linkCount ?? 0,
    ongoing: dto.ongoing === true,
  };
}
