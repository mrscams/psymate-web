import { Injectable } from '@angular/core';

import { demoAgenda } from './agenda.fixtures';
import { AgendaData, AgendaRange, SyncStatus } from './agenda.model';

/**
 * Service de données de features/agenda (handbook §2, couche 4). Le contrat ne porte pas encore
 * l'agenda (G Q25 : module `scheduling` à venir, `GET /api/agenda?from&to`, `POST /api/appointments`…) :
 * en attendant, ce service sert les données de démonstration de agenda.fixtures.ts, de façon
 * asynchrone comme le fera le client généré. Le jour venu, seul ce fichier importe `src/app/api`
 * et traduit les DTO ; le store et les composants ne changent pas.
 */
@Injectable({ providedIn: 'root' })
export class AgendaApi {
  /** Futur `GET /api/agenda?from&to` : séances et blocs « occupé » des agendas Google en lecture. */
  async load(range: AgendaRange): Promise<AgendaData> {
    await Promise.resolve();
    return demoAgenda(range);
  }

  /** Futur `GET /api/me/integrations/google/status`. */
  async syncStatus(): Promise<SyncStatus> {
    await Promise.resolve();
    return { state: 'ok', minutesAgo: 2 };
  }
}
