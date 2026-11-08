import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreateLinkRequest,
  EntreesService,
  EntryDto,
  EntrySearchItemDto,
  LiensService,
  LinkDto,
  LinkTypeView,
  RechercheService,
  VocabulaireService,
} from '../../../api';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import {
  EntryLink,
  LinkDraft,
  LinkEntry,
  LinkLineStyle,
  LinkTypeCode,
  LinkTypeOption,
  plainText,
  SourceEntry,
  toCreateBody,
} from './link.model';

/** La recherche de cible n'en montre qu'une page (20, GET /api/patients/{id}/search). */
export interface TargetQuery {
  q: string;
  /** Type d'entrée à retenir ; null : tous. */
  type: EntryType | null;
}

/**
 * Service de données de l'éditeur de lien (handbook §2, couche 4) : le seul fichier de features/graph
 * qui importe le client généré (Liens, Vocabulaire pour la matrice, Recherche pour la cible, Entrées
 * pour la source). Traduit les DTO en modèles de vue ; les erreurs arrivent déjà en ApiProblem
 * (core/http). Les libellés des types viennent du catalogue, dans la langue de l'interface.
 */
@Injectable({ providedIn: 'root' })
export class LinkApi {
  private readonly links = inject(LiensService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly search = inject(RechercheService);
  private readonly entries = inject(EntreesService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /** GET /api/vocabulary/link-types : les huit types et leur matrice (E5.3), dans l'ordre du catalogue. */
  async linkTypes(): Promise<LinkTypeOption[]> {
    const list = await firstValueFrom(this.vocabulary.linkTypes());
    return list.map((view) => toLinkType(view, this.english));
  }

  /** GET /api/entries/{id} : l'entrée ouverte (404 ENTRY_NOT_FOUND, 403 PATIENT_FORBIDDEN). */
  async entry(entryId: string): Promise<SourceEntry> {
    return toSource(await firstValueFrom(this.entries.getEntry(entryId)));
  }

  /** GET /api/entries/{id}/links : liens acceptés, vus depuis l'entrée, du plus ancien au plus récent. */
  async linksOf(entryId: string): Promise<EntryLink[]> {
    const list = await firstValueFrom(this.links.listEntryLinks(entryId));
    return list.map(toLink);
  }

  /**
   * GET /api/patients/{id}/search, page 1 : cibles possibles dans le dossier (sans texte : les plus
   * récentes d'abord). Entrées archivées exclues (elles ne se lient pas).
   */
  async targets(patientId: string, query: TargetQuery): Promise<LinkEntry[]> {
    const q = query.q.trim();
    const result = await firstValueFrom(
      this.search.searchPatientEntries(
        patientId,
        q || undefined,
        query.type ? [query.type] : undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        1,
      ),
    );
    return (result.items ?? []).map(toCandidate);
  }

  /** POST /api/entries/{id}/links → 201, le lien vu depuis l'entrée (409 LINK_EXISTS, 422). */
  async create(entryId: string, draft: LinkDraft): Promise<EntryLink> {
    const body = toCreateBody(draft) as unknown as CreateLinkRequest;
    return toLink(await firstValueFrom(this.links.createLink(entryId, body)));
  }

  /** PATCH /api/links/{id} → 200, un nouveau lien ; l'ancien passe superseded (409 LINK_EXISTS). */
  async changeType(linkId: string, linkType: LinkTypeCode): Promise<EntryLink> {
    return toLink(await firstValueFrom(this.links.changeLinkType(linkId, { linkType })));
  }

  /** DELETE /api/links/{id} → 204 : le lien passe superseded, jamais effacé (G Q41) ; idempotent. */
  async remove(linkId: string): Promise<void> {
    await firstValueFrom(this.links.removeLink(linkId));
  }
}

function entryType(value: string | undefined): EntryType {
  return ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'note';
}

function entryTypes(values: string[] | undefined): EntryType[] {
  return (values ?? []).filter((value): value is EntryType =>
    ENTRY_TYPES.includes(value as EntryType),
  );
}

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
    lineStyle: (view.lineStyle as LinkLineStyle | undefined) ?? 'solid',
  };
}

function toSource(dto: EntryDto): SourceEntry {
  return {
    id: dto.id ?? '',
    patientId: dto.patientId ?? '',
    type: entryType(dto.type),
    title: dto.title?.trim() || null,
    excerpt: dto.body?.trim() || null,
    occurredFrom: dto.occurred?.from ?? null,
    occurredTo: dto.occurred?.to ?? null,
    precision: (dto.occurred?.precision as OccurredPrecision | undefined) ?? null,
    linkCount: dto.linkCount ?? 0,
    archived: !!dto.archivedAt,
  };
}

function toCandidate(item: EntrySearchItemDto): LinkEntry {
  return {
    id: item.entryId ?? '',
    type: entryType(item.type),
    title: plainText(item.title),
    excerpt: plainText(item.snippet),
    occurredFrom: item.occurredFrom ?? null,
    occurredTo: item.occurredTo ?? null,
    precision: (item.occurredPrecision as OccurredPrecision | undefined) ?? null,
  };
}

function toLink(dto: LinkDto): EntryLink {
  return {
    id: dto.id ?? '',
    linkType: dto.linkType as LinkTypeCode,
    sourceId: dto.sourceId ?? '',
    targetId: dto.targetId ?? '',
    label: dto.label ?? '',
    sentence: dto.sentence ?? '',
    rationale: dto.rationale?.trim() || null,
    createdAt: dto.createdAt ?? null,
  };
}
