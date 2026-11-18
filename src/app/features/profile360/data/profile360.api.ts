import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PatientProfileDto, PatientProfileItemDto, Profil360Service } from '../../../api';
import { asCategory, ProfileItem } from './profile360.model';

/**
 * Service de données du Profil 360 (handbook §2, couche 4 ; fiche 30, G Q55) : le seul fichier de la
 * feature qui importe le client généré. M13-06 ne lit que GET /api/patients/{id}/profile-items ; les
 * écritures (POST, PATCH, DELETE) arrivent avec le panneau (M13-07). Les erreurs arrivent déjà en
 * ApiProblem (core/http) : 403 PATIENT_FORBIDDEN, 404 PATIENT_NOT_FOUND.
 */
@Injectable({ providedIn: 'root' })
export class Profile360Api {
  private readonly api = inject(Profil360Service);

  /** Tout le profil en un appel, dans l'ordre du serveur (jamais retrié ici). */
  async profile(patientId: string): Promise<ProfileItem[]> {
    return toItems(await firstValueFrom(this.api.listPatientProfileItems(patientId)));
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
