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
