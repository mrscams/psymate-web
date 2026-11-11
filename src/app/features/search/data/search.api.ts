import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ChronologieService,
  EntreesService,
  EntryDto,
  EntrySearchItemDto,
  EntrySearchResultDto,
  LiensService,
  LinkDto,
  RechercheService,
} from '../../../api';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { OCCURRED_PRECISIONS, OccurredPrecision } from '../../../shared/util';
import {
  elideSnippet,
  EntryPreview,
  parseMarked,
  PreviewLink,
  SearchHit,
  SearchPage,
  SearchRequest,
  SessionOption,
  TypeCount,
} from './search.model';

/** Au plus 200 séances dans le sélecteur « Séance » (limite de la chronologie). */
const SESSIONS_LIMIT = 200;

/**
 * Service de données de features/search (handbook §2, couche 4) : le seul fichier de la feature
 * qui importe le client généré (Recherche ; Entrées et Liens pour l'aperçu ; Chronologie pour la
 * liste des séances). Traduit les DTO en modèles de vue ; les erreurs arrivent déjà en ApiProblem.
 */
@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly search = inject(RechercheService);
  private readonly entries = inject(EntreesService);
  private readonly links = inject(LiensService);
  private readonly timeline = inject(ChronologieService);

  /** GET /api/patients/{id}/search (400 SEARCH_BAD_REQUEST, 403, 404). */
  async find(patientId: string, request: SearchRequest): Promise<SearchPage> {
    const dto = await firstValueFrom(
      this.search.searchPatientEntries(
        patientId,
        request.q || undefined,
        request.types.length > 0 ? request.types : undefined,
        undefined,
        undefined,
        request.from ?? undefined,
        request.to ?? undefined,
        request.sessionId ?? undefined,
        request.includeArchived || undefined,
        request.page > 1 ? request.page : undefined,
      ),
    );
    return toPage(dto);
  }

  /** GET /api/entries/{id} et GET /api/entries/{id}/links, ensemble, pour l'aperçu. */
  async preview(entryId: string): Promise<EntryPreview> {
    const [entry, links] = await Promise.all([
      firstValueFrom(this.entries.getEntry(entryId)),
      firstValueFrom(this.links.listEntryLinks(entryId)),
    ]);
    return toPreview(entry, links);
  }

  /** Séances du patient (GET …/timeline?types=session), la plus récente en premier. */
  async sessions(patientId: string): Promise<SessionOption[]> {
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
      }));
  }
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((item) => item === value) ?? fallback;
}

function toType(value: unknown): EntryType {
  return oneOf(ENTRY_TYPES, value, 'note');
}

function toPrecision(value: unknown): OccurredPrecision {
  return oneOf(OCCURRED_PRECISIONS, value, 'exact');
}

export function toHit(dto: EntrySearchItemDto): SearchHit {
  return {
    entryId: dto.entryId ?? '',
    type: toType(dto.type),
    title: parseMarked(dto.title),
    snippet: parseMarked(dto.snippet),
    occurredFrom: dto.occurredFrom ?? null,
    occurredTo: dto.occurredTo ?? null,
    precision: toPrecision(dto.occurredPrecision),
    sessionId: dto.sessionId ?? null,
    tags: dto.tags ?? [],
    version: dto.version ?? 1,
    visibility: dto.visibility === 'private' ? 'private' : 'clinical',
    archived: !!dto.archivedAt,
    approximate: dto.approximate === true,
  };
}

export function toPage(dto: EntrySearchResultDto): SearchPage {
  // Avec un texte, les extraits exacts viennent de ts_headline, dont les fragments sont séparés
  // par « ... » ; les approchés et ceux d'une recherche sans texte n'en ont pas (contrat).
  const headline = !!dto.query?.text?.trim();
  const hits = (dto.items ?? [])
    .filter((item) => !!item.entryId)
    .map(toHit)
    .map((hit) =>
      headline && !hit.approximate ? { ...hit, snippet: elideSnippet(hit.snippet) } : hit,
    );
  const counts: TypeCount[] = ENTRY_TYPES.map((type) => ({
    type,
    count: dto.facets?.types?.find((facet) => facet.code === type)?.count ?? 0,
  }));
  return {
    total: dto.total ?? 0,
    page: dto.page ?? 1,
    pageSize: dto.pageSize ?? 20,
    tookMs: dto.tookMs ?? 0,
    exact: hits.filter((hit) => !hit.approximate),
    approximate: hits.filter((hit) => hit.approximate),
    counts,
    query: {
      text: dto.query?.text ?? '',
      tags: dto.query?.tags ?? [],
      emotions: dto.query?.emotions ?? [],
      before: dto.query?.before ?? null,
      after: dto.query?.after ?? null,
    },
  };
}

function toLink(dto: LinkDto): PreviewLink | null {
  if (!dto.id || dto.status === 'superseded') return null;
  return { id: dto.id, sentence: dto.sentence ?? dto.label ?? '' };
}

export function toPreview(dto: EntryDto, links: LinkDto[]): EntryPreview {
  return {
    id: dto.id ?? '',
    type: toType(dto.type),
    title: dto.title ?? null,
    body: dto.body ?? null,
    occurred: {
      from: dto.occurred?.from ?? null,
      to: dto.occurred?.to ?? null,
      precision: toPrecision(dto.occurred?.precision),
      label: dto.occurred?.label ?? null,
    },
    recordedAt: dto.recordedAt ?? null,
    sessionId: dto.sessionId ?? null,
    version: dto.version ?? 1,
    visibility: dto.visibility === 'private' ? 'private' : 'clinical',
    archived: !!dto.archivedAt,
    intensity: dto.feeling?.intensity ?? null,
    links: links.map(toLink).filter((link): link is PreviewLink => link !== null),
  };
}
