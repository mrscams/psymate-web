import { ActiveSession } from './security.api';

/** Autres sessions affichées une à une sous « Cet appareil » (UX-C5) ; les suivantes sont repliées. */
export const RECENT_SESSIONS_SHOWN = 4;

/** Sessions d'un même appareil (« Chrome · Windows »), la plus récemment utilisée d'abord. */
export interface DeviceGroup {
  /** Clé stable du groupe : le libellé de l'appareil, ou '' quand il est inconnu. */
  key: string;
  device: string | null;
  sessions: ActiveSession[];
  /** Dernière activité du groupe (celle de sa session la plus récente). */
  lastAccessAt: string;
}

/**
 * Plus récemment utilisée d'abord (l'API les rend déjà dans cet ordre ; le tri ne fait que le
 * garantir). Aucun filtre local : les sessions listées sont celles que le serveur dit actives.
 */
export function byRecentActivity(sessions: readonly ActiveSession[]): ActiveSession[] {
  return [...sessions].sort((a, b) => time(b.lastAccessAt) - time(a.lastAccessAt));
}

/** Regroupe par appareil ; groupes triés par dernière activité, sessions de même. */
export function groupByDevice(sessions: readonly ActiveSession[]): DeviceGroup[] {
  const groups = new Map<string, DeviceGroup>();
  for (const session of byRecentActivity(sessions)) {
    const key = session.device ?? '';
    const group = groups.get(key);
    if (group) {
      group.sessions.push(session);
    } else {
      groups.set(key, {
        key,
        device: session.device,
        sessions: [session],
        lastAccessAt: session.lastAccessAt,
      });
    }
  }
  return [...groups.values()];
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
