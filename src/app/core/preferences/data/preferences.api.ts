import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Preferences as PreferencesDto, PreferencesService } from '../../../api';
import { completePreferences, Preferences } from '../preferences.model';

/**
 * Service de données des préférences : seul fichier de core/preferences qui parle au client généré.
 * Le serveur renvoie toujours les 9 clés effectives ; on les complète quand même par les défauts
 * (clé absente ou hors domaine → défaut), sans jamais en inventer.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesApi {
  private readonly service = inject(PreferencesService);

  /** GET /api/me/preferences. */
  async get(defaults: Preferences): Promise<Preferences> {
    return completePreferences(await firstValueFrom(this.service.getPreferences()), defaults);
  }

  /**
   * PATCH /api/me/preferences (merge-patch RFC 7396) : seulement les clés passées, les autres sont
   * conservées côté serveur. Renvoie les 9 préférences après fusion. Un 422 VALIDATION_FAILED
   * (errors[].field = la clé fautive) arrive en ApiProblem.
   */
  async patch(changes: Partial<Preferences>, defaults: Preferences): Promise<Preferences> {
    const body: PreferencesDto = changes as PreferencesDto;
    return completePreferences(
      await firstValueFrom(this.service.updatePreferences(body)),
      defaults,
    );
  }
}
