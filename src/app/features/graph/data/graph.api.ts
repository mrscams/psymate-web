import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  GraphDto,
  GraphEdgeDto,
  GrapheService,
  GraphNodeDto,
  GraphSuperNodeDto,
  VocabulaireService,
} from '../../../api';
import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { GraphDepth, GraphEdge, GraphNode, GraphSuperNode, GraphView } from './graph.model';
import { LinkTypeCode } from './link.model';

/** Ce que GET /api/patients/{id}/graph reçoit (from calculé depuis la période par le store). */
export interface GraphRequest {
  root: string | null;
  depth: GraphDepth;
  linkTypes: LinkTypeCode[];
  from: string | null;
}

/**
 * Service de données de la vue graphe (handbook §2, couche 4) : Graphe (voisinage, dépliage d'un
 * super-nœud) et Vocabulaire (nom des émotions). Traduit les DTO en modèles de vue ; les erreurs
 * arrivent déjà en ApiProblem (core/http). Les types de liens, l'entrée et ses liens passent par
 * LinkApi (même feature).
 */
@Injectable({ providedIn: 'root' })
export class GraphApi {
  private readonly graph = inject(GrapheService);
  private readonly vocabulary = inject(VocabulaireService);
  private readonly english = inject(LOCALE_ID).startsWith('en');

  /**
   * GET /api/patients/{id}/graph : voisinage de la racine à `depth` sauts, ou sans racine les
   * entrées les plus liées (150 nœuds au plus, super-nœuds au-delà). 404 ENTRY_NOT_FOUND, 409
   * ENTRY_ARCHIVED (racine), 422 VALIDATION_FAILED.
   */
  async neighbourhood(patientId: string, request: GraphRequest): Promise<GraphView> {
    const dto = await firstValueFrom(
      this.graph.getPatientGraph(
        patientId,
        request.root ?? undefined,
        request.depth,
        request.linkTypes.length ? request.linkTypes : undefined,
        request.from ?? undefined,
        undefined,
      ),
    );
    return toView(dto);
  }

  /** POST /api/patients/{id}/graph/expand { superNodeId } : les membres et leurs liens (404 SUPER_NODE_NOT_FOUND). */
  async expand(patientId: string, superNodeId: string): Promise<GraphView> {
    return toView(await firstValueFrom(this.graph.expandGraphGroup(patientId, { superNodeId })));
  }

  /** GET /api/vocabulary/emotions : code → libellé dans la langue de l'interface. */
  async emotionLabels(): Promise<Record<string, string>> {
    const list = await firstValueFrom(this.vocabulary.emotions());
    const labels: Record<string, string> = {};
    for (const emotion of list) {
      if (!emotion.code) continue;
      labels[emotion.code] =
        (this.english ? emotion.labelEn : null) || emotion.labelFr || emotion.code;
    }
    return labels;
  }
}

function entryType(value: string | undefined): EntryType {
  return ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'note';
}

export function toView(dto: GraphDto): GraphView {
  return {
    nodes: (dto.nodes ?? []).filter((node) => !!node.id).map(toNode),
    edges: (dto.edges ?? []).filter((edge) => !!edge.id).map(toEdge),
    superNodes: (dto.superNodes ?? []).filter((group) => !!group.id).map(toSuperNode),
    truncated: !!dto.truncated,
  };
}

function toNode(dto: GraphNodeDto): GraphNode {
  return {
    id: dto.id ?? '',
    type: entryType(dto.type),
    title: dto.title?.trim() || null,
    occurred: dto.occurred ?? null,
    intensity: dto.intensity ?? null,
    emotion: dto.emotion ?? null,
    degree: dto.degree ?? 0,
    distance: dto.distance ?? 0,
    // Lecture seule, jamais dessiné (A11) : practitioner en V1.
    authorType: dto.authorType ?? 'practitioner',
  };
}

function toEdge(dto: GraphEdgeDto): GraphEdge {
  return {
    id: dto.id ?? '',
    source: dto.source ?? '',
    target: dto.target ?? '',
    linkType: dto.linkType as LinkTypeCode,
    directed: dto.directed ?? true,
    provenance: dto.provenance ?? 'manual',
    status: dto.status ?? 'accepted',
  };
}

function toSuperNode(dto: GraphSuperNodeDto): GraphSuperNode {
  return {
    id: dto.id ?? '',
    type: entryType(dto.type),
    count: dto.count ?? dto.memberIds?.length ?? 0,
    dominantEmotion: dto.dominantEmotion ?? null,
    memberIds: dto.memberIds ?? [],
    neighborId: dto.neighborId ?? '',
  };
}
