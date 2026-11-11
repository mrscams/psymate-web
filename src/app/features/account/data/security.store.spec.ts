import { TestBed } from '@angular/core/testing';

import { SessionApi } from '../../../core/auth/data/session.api';
import { SecurityApi, SecurityOverview } from './security.api';
import { manySessions, OVERVIEW } from './security.fixtures';
import { SecurityStore } from './security.store';

function setup(api: Partial<SecurityApi>) {
  TestBed.configureTestingModule({
    providers: [
      SecurityStore,
      { provide: SecurityApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  return TestBed.inject(SecurityStore);
}

describe('SecurityStore', () => {
  it('load : chargement puis sessions (courante à part) et connexion précédente', async () => {
    const store = setup({ loadSecurity: vi.fn().mockResolvedValue(OVERVIEW) });
    const pending = store.load();
    expect(store.overview().status).toBe('loading');
    await pending;
    expect(store.overview().status).toBe('loaded');
    expect(store.sessions()).toHaveLength(2);
    expect(store.otherSessions().map((s) => s.id)).toEqual(['s-ipad']);
    expect(store.lastLogin()?.device).toBe('Chrome · Windows');
  });

  it('UX-C5 : sessions bornées, cet appareil + 4 plus récentes, le reste regroupé par appareil', async () => {
    const store = setup({ loadSecurity: vi.fn().mockResolvedValue(manySessions(10)) });
    await store.load();
    expect(store.currentSession()?.id).toBe('s-current');
    expect(store.recentSessions().map((s) => s.id)).toEqual(['s-1', 's-2', 's-3', 's-4']);
    expect(store.olderSessions().map((s) => s.id)).toEqual([
      's-5',
      's-6',
      's-7',
      's-8',
      's-9',
      's-10',
    ]);
    const groups = store.olderGroups();
    expect(groups.map((g) => [g.device, g.sessions.length])).toEqual([
      ['Chrome · Windows', 2],
      ['Firefox · Linux', 2],
      [null, 1],
      ['Safari · iPadOS', 1],
    ]);
    expect(groups[0].lastAccessAt).toBe(store.olderSessions()[0].lastAccessAt);
    // Toutes les sessions : Chrome (dont la courante), Firefox, inconnu, Safari.
    expect(store.deviceCount()).toBe(4);
  });

  it('UX-C5 : 4 autres sessions ou moins, rien n’est replié', async () => {
    const store = setup({ loadSecurity: vi.fn().mockResolvedValue(manySessions(4)) });
    await store.load();
    expect(store.recentSessions()).toHaveLength(4);
    expect(store.olderSessions()).toEqual([]);
    expect(store.olderGroups()).toEqual([]);
  });

  it('load en erreur : état erreur avec le problème, donnée précédente conservée', async () => {
    const loadSecurity = vi
      .fn()
      .mockResolvedValueOnce(OVERVIEW)
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' });
    const store = setup({ loadSecurity });
    await store.load();
    await store.load();
    expect(store.overview().status).toBe('error');
    expect(store.overview().problem?.code).toBe('INTERNAL_ERROR');
    expect(store.sessions()).toHaveLength(2);
  });

  it('revokeSession : 204 puis relecture ; 404 gardé comme erreur, liste inchangée', async () => {
    const afterRevoke: SecurityOverview = { ...OVERVIEW, sessions: [OVERVIEW.sessions[0]] };
    const loadSecurity = vi
      .fn()
      .mockResolvedValueOnce(OVERVIEW)
      .mockResolvedValueOnce(afterRevoke)
      .mockResolvedValue(afterRevoke);
    const revokeSession = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ status: 404, code: 'SESSION_NOT_FOUND' });
    const store = setup({ loadSecurity, revokeSession });
    await store.load();
    await expect(store.revokeSession('s-ipad')).resolves.toBe(true);
    expect(revokeSession).toHaveBeenCalledWith('s-ipad');
    expect(loadSecurity).toHaveBeenCalledTimes(2);
    expect(store.otherSessions()).toHaveLength(0);

    await expect(store.revokeSession('s-ipad')).resolves.toBe(false);
    expect(store.revokeProblem()?.code).toBe('SESSION_NOT_FOUND');
    expect(store.revoking()).toBeNull();
    expect(loadSecurity).toHaveBeenCalledTimes(2);
  });

  it('revokeOthers : nombre du serveur (0 compris) puis relecture ; erreur gardée', async () => {
    const loadSecurity = vi.fn().mockResolvedValue(OVERVIEW);
    const revokeOtherSessions = vi
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const store = setup({ loadSecurity, revokeOtherSessions });
    await store.load();
    await expect(store.revokeOthers()).resolves.toBe(2);
    expect(store.revokedOthers()).toBe(2);
    expect(loadSecurity).toHaveBeenCalledTimes(2);
    await expect(store.revokeOthers()).resolves.toBe(0);
    expect(store.revokedOthers()).toBe(0);
    await expect(store.revokeOthers()).resolves.toBeNull();
    expect(store.revokeOthersStatus()).toBe('error');
    expect(store.revokeOthersProblem()?.code).toBe('NETWORK_ERROR');
    expect(store.revokedOthers()).toBeNull();
  });
});
