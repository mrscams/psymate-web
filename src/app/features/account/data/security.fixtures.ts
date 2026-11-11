import { SecurityOverview } from './security.api';

/** Jeu de données des specs (store et page) : deux sessions, la courante d'abord, et une connexion précédente. */
export const OVERVIEW: SecurityOverview = {
  sessions: [
    {
      id: 's-current',
      device: 'Chrome · Windows',
      city: null,
      createdAt: '2026-11-07T08:00:00Z',
      lastAccessAt: '2026-11-07T09:12:00Z',
      expiresAt: '2026-11-07T21:12:00Z',
      current: true,
    },
    {
      id: 's-ipad',
      device: 'Safari · iPadOS',
      city: null,
      createdAt: '2026-11-05T18:00:00Z',
      lastAccessAt: '2026-11-05T18:30:00Z',
      expiresAt: '2026-12-05T18:30:00Z',
      current: false,
    },
  ],
  lastLogin: { at: '2026-10-24T07:12:00Z', device: 'Chrome · Windows', city: null },
};

/**
 * Compte aux sessions accumulées (audit UX : 121 sessions) : la courante, puis `others` sessions
 * d'autres appareils, une par minute en remontant, dans un ordre mélangé ; appareils en rotation.
 */
export function manySessions(others: number): SecurityOverview {
  const devices = ['Chrome · Windows', 'Firefox · Linux', null, 'Safari · iPadOS'];
  const at = (minutesAgo: number) =>
    new Date(Date.parse('2026-11-07T09:12:00Z') - minutesAgo * 60_000).toISOString();
  const list = Array.from({ length: others }, (_, i) => ({
    id: `s-${i + 1}`,
    device: devices[i % devices.length],
    city: null,
    createdAt: at(i + 60),
    lastAccessAt: at(i + 1),
    expiresAt: '2026-12-07T09:12:00Z',
    current: false,
  })).reverse();
  return { sessions: [...list, OVERVIEW.sessions[0]], lastLogin: OVERVIEW.lastLogin };
}
