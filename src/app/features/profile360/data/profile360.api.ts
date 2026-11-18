import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreatePatientProfileItemRequest,
  PatientProfileDto,
  PatientProfileItemDto,
  Profil360Service,
  UpdatePatientProfileItemRequest,
} from '../../../api';
import {
  asCategory,
  CreateProfileItemBody,
  ProfileItem,
  UpdateProfileItemBody,
} from './profile360.model';

/**
 * Service de données du Profil 360 (handbook §2, couche 4 ; fiche 30, G Q54 et Q55) : le seul
 * fichier de la feature qui importe le client généré. Une lecture (GET /api/patients/{id}/
 * profile-items) et trois écritures (POST, PATCH, DELETE …/profile-items/{itemId}) ; après une
 * écriture, le store relit le profil, il ne garde pas la réponse. Les erreurs arrivent déjà en
 * ApiProblem (core/http) : 403 PATIENT_FORBIDDEN, 404 PATIENT_NOT_FOUND ou PROFILE_ITEM_NOT_FOUND,
 * 409 PATIENT_ARCHIVED ou PROFILE_ITEM_ARCHIVED, 422 VALIDATION_FAILED ou PROFILE_ITEM_LIMIT_REACHED.
 */
@Injectable({ providedIn: 'root' })
export class Profile360Api {
  private readonly api = inject(Profil360Service);

  /** Tout le profil en un appel, dans l'ordre du serveur (jamais retrié ici). */
  async profile(patientId: string): Promise<ProfileItem[]> {
    return toItems(await firstValueFrom(this.api.listPatientProfileItems(patientId)));
  }

  /** Ajoute une information (201) ; les champs vides sont absents du corps. */
  async create(patientId: string, body: CreateProfileItemBody): Promise<void> {
    await firstValueFrom(
      this.api.createPatientProfileItem(patientId, body as CreatePatientProfileItemRequest),
    );
  }

  /**
   * Corrige une information : seuls les champs modifiés ; null efface (le type généré n'écrit pas
   * null, d'où la conversion).
   */
  async update(patientId: string, itemId: string, body: UpdateProfileItemBody): Promise<void> {
    await firstValueFrom(
      this.api.updatePatientProfileItem(
        patientId,
        itemId,
        body as unknown as UpdatePatientProfileItemRequest,
      ),
    );
  }

  /** Retire une information du profil (204, archivage logique, idempotent). */
  async remove(patientId: string, itemId: string): Promise<void> {
    await firstValueFrom(this.api.archivePatientProfileItem(patientId, itemId));
  }
}

/**
 * Traduit la réponse en modèle de vue, dans l'ordre reçu. Une information sans identifiant ou d'une
 * rubrique inconnue (contrat plus récent que le client) est écartée plutôt que mal rangée.
 */
export function toItems(dto: PatientProfileDto): ProfileItem[] {
  const items: ProfileItem[] = [];
  for (const item of dto.items ?? []) {
    const view = toItem(item);
    if (view) items.push(view);
  }
  return items;
}

function toItem(dto: PatientProfileItemDto): ProfileItem | null {
  const category = asCategory(dto.category);
  if (!dto.id || !category) return null;
  return {
    id: dto.id,
    category,
    title: dto.title ?? '',
    detail: dto.detail || null,
    periodLabel: dto.periodLabel || null,
    periodYear: dto.periodYear ?? null,
  };
}
