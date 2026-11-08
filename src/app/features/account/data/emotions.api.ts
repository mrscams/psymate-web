import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreateEmotionRequestFamilyEnum,
  EmotionsPersonnellesService,
  EmotionView,
  MergeView,
  VocabulaireService,
} from '../../../api';

/** Famille de la roue de Plutchik (contrat : EmotionView.family). */
export type EmotionFamily =
  'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';

/** Ordre d'affichage des familles (fiche 17, maquette). */
export const EMOTION_FAMILIES: readonly EmotionFamily[] = [
  'joy',
  'trust',
  'fear',
  'surprise',
  'sadness',
  'disgust',
  'anger',
  'anticipation',
];

/** Émotion utilisable dans un ressenti : globale (29) ou personnalisée par le praticien. */
export interface Emotion {
  code: string;
  scope: 'global' | 'custom';
  family: EmotionFamily;
  labelFr: string;
  labelEn: string | null;
}

/** Fusion d'une émotion personnalisée dans une autre, annulable 30 jours (MergeView). */
export interface EmotionMerge {
  id: string;
  sourceCode: string;
  targetCode: string;
  /** Ressentis passés de la source à la cible (compté par l'API au moment de la fusion, G Q42). */
  affectedCount: number;
  mergedAt: string;
  undoUntil: string;
  undoneAt: string | null;
}

/**
 * Service de données des émotions (fiche 17) : seul fichier du vocabulaire des émotions qui importe
 * le client généré (Vocabulaire, Émotions personnelles). Traduit les DTO en modèles de vue ; les
 * erreurs arrivent déjà en ApiProblem (problem.interceptor).
 */
@Injectable({ providedIn: 'root' })
export class EmotionsApi {
  private readonly vocabulary = inject(VocabulaireService);
  private readonly mine = inject(EmotionsPersonnellesService);

  /** GET /api/vocabulary/emotions : les 29 globales, puis les personnalisées actives. */
  async list(): Promise<Emotion[]> {
    return (await firstValueFrom(this.vocabulary.emotions())).map(toEmotion);
  }

  /** POST /api/me/emotions → 201 ; 409 EMOTION_LABEL_EXISTS, 422 VALIDATION_FAILED. */
  async create(labelFr: string, family: EmotionFamily): Promise<Emotion> {
    const created = await firstValueFrom(
      this.mine.create1({ labelFr, family: family as CreateEmotionRequestFamilyEnum }),
    );
    return toEmotion(created);
  }

  /** PATCH /api/me/emotions/{code} : seul le libellé français change, le code reste. */
  async rename(code: string, labelFr: string): Promise<Emotion> {
    return toEmotion(await firstValueFrom(this.mine.rename1(code, { labelFr })));
  }

  /** POST /api/me/emotions/{code}/merge → la fusion (id pour l'annuler, affectedCount). */
  async merge(sourceCode: string, targetCode: string): Promise<EmotionMerge> {
    return toMerge(await firstValueFrom(this.mine.merge1(sourceCode, { targetCode })));
  }

  /** POST /api/me/emotions/merges/{id}/undo : 409 MERGE_ALREADY_UNDONE, MERGE_UNDO_EXPIRED. */
  async undo(mergeId: string): Promise<EmotionMerge> {
    return toMerge(await firstValueFrom(this.mine.undo(mergeId)));
  }
}

function toEmotion(dto: EmotionView): Emotion {
  return {
    code: dto.code ?? '',
    scope: dto.scope === 'custom' ? 'custom' : 'global',
    family: (dto.family ?? 'joy') as EmotionFamily,
    labelFr: dto.labelFr ?? '',
    labelEn: dto.labelEn ?? null,
  };
}

function toMerge(dto: MergeView): EmotionMerge {
  return {
    id: dto.id ?? '',
    sourceCode: dto.sourceCode ?? '',
    targetCode: dto.targetCode ?? '',
    affectedCount: dto.affectedCount ?? 0,
    mergedAt: dto.mergedAt ?? '',
    undoUntil: dto.undoUntil ?? '',
    undoneAt: dto.undoneAt ?? null,
  };
}
