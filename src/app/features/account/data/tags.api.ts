import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { TagsService, TagView } from '../../../api';
import { ApiProblem } from '../../../core/http';

/** Tag libre du praticien (TagView). */
export interface Tag {
  id: string;
  label: string;
  normalizedLabel: string;
  /** Compteur d'usages (patients et entrées), additionné lors d'une fusion. */
  usageCount: number;
  createdAt: string;
}

/**
 * Service de données des tags du praticien (/mon-compte/tags) : seul fichier de la page des tags
 * qui importe le client généré. Les erreurs arrivent en ApiProblem (TAG_EXISTS, TAG_IS_EMOTION
 * avec la propriété suggestedEmotion dans `extra`, TAG_NOT_FOUND).
 */
@Injectable({ providedIn: 'root' })
export class TagsApi {
  private readonly tags = inject(TagsService);

  /** GET /api/tags : tags actifs, triés par libellé normalisé. */
  async list(): Promise<Tag[]> {
    return (await firstValueFrom(this.tags.list())).map(toTag);
  }

  /** POST /api/tags → 201 ; 409 TAG_EXISTS ; 422 TAG_IS_EMOTION ou VALIDATION_FAILED. */
  async create(label: string): Promise<Tag> {
    return toTag(await firstValueFrom(this.tags.create({ label })));
  }

  /** PATCH /api/tags/{id} : s'applique partout où le tag est utilisé. */
  async rename(id: string, label: string): Promise<Tag> {
    return toTag(await firstValueFrom(this.tags.rename(id, { label })));
  }

  /** POST /api/tags/{id}/merge : la source est archivée, la réponse est la cible mise à jour. */
  async merge(sourceId: string, targetId: string): Promise<Tag> {
    return toTag(await firstValueFrom(this.tags.merge(sourceId, { targetId })));
  }
}

function toTag(dto: TagView): Tag {
  return {
    id: dto.id ?? '',
    label: dto.label ?? '',
    normalizedLabel: dto.normalizedLabel ?? '',
    usageCount: dto.usageCount ?? 0,
    createdAt: dto.createdAt ?? '',
  };
}

/** Émotion proposée par un 422 TAG_IS_EMOTION (propriété suggestedEmotion du problème). */
export interface SuggestedEmotion {
  code: string;
  labelFr: string;
}

/** suggestedEmotion d'un TAG_IS_EMOTION, ou null (autre erreur, propriété absente ou illisible). */
export function suggestedEmotion(problem: ApiProblem | null): SuggestedEmotion | null {
  if (problem?.code !== 'TAG_IS_EMOTION') return null;
  const raw = problem.extra?.['suggestedEmotion'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { code, labelFr } = raw as Record<string, unknown>;
  return typeof code === 'string' && typeof labelFr === 'string' ? { code, labelFr } : null;
}
