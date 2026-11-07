import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../http/api-problem';
import { SessionApi } from './data/session.api';
import { SessionUser } from './session.model';
import { SessionStore } from './session.store';

const claire: SessionUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: true,
  passwordChangeRequired: false,
};

function setup(api: Partial<Record<keyof SessionApi, ReturnType<typeof vi.fn>>>) {
  TestBed.configureTestingModule({ providers: [{ provide: SessionApi, useValue: api }] });
  return TestBed.inject(SessionStore);
}

describe('SessionStore', () => {
  it('démarre sans session', () => {
    const store = setup({});
    expect(store.authenticated()).toBe(false);
    expect(store.me()).toBeNull();
    expect(store.role()).toBeNull();
    expect(store.status()).toBe('idle');
  });

  it('load() : GET /api/auth/me remplit la session et ses signaux dérivés', async () => {
    const store = setup({ me: vi.fn().mockResolvedValue(claire) });
    const pending = store.load();
    expect(store.status()).toBe('loading');
    await pending;

    expect(store.status()).toBe('idle');
    expect(store.authenticated()).toBe(true);
    expect(store.role()).toBe('practitioner');
    expect(store.isAdmin()).toBe(false);
    expect(store.verificationStatus()).toBe('approved');
    expect(store.twoFactorEnabled()).toBe(true);
    expect(store.passwordChangeRequired()).toBe(false);
  });

  it('load() : un 401 veut dire « pas de session », sans erreur ni rejet', async () => {
    const unauthenticated: ApiProblem = { status: 401, code: 'UNAUTHENTICATED' };
    const store = setup({ me: vi.fn().mockRejectedValue(unauthenticated) });

    await expect(store.load()).resolves.toBeUndefined();
    expect(store.authenticated()).toBe(false);
    expect(store.status()).toBe('idle');
    expect(store.problem()).toBeNull();
  });

  it('load() : une panne est gardée en erreur, sans rejet (le démarrage continue)', async () => {
    const down: ApiProblem = { status: 503, code: 'INTERNAL_ERROR' };
    const store = setup({ me: vi.fn().mockRejectedValue(down) });

    await expect(store.load()).resolves.toBeUndefined();
    expect(store.authenticated()).toBe(false);
    expect(store.status()).toBe('error');
    expect(store.problem()).toEqual(down);
  });

  it('signIn() puis clear()', () => {
    const store = setup({});
    store.signIn({ ...claire, role: 'admin' });
    expect(store.isAdmin()).toBe(true);
    store.clear();
    expect(store.authenticated()).toBe(false);
  });

  it('logout() : POST /api/auth/logout puis oubli de la session', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const store = setup({ logout });
    store.signIn(claire);
    await store.logout();
    expect(logout).toHaveBeenCalledOnce();
    expect(store.authenticated()).toBe(false);
  });

  it('logout() oublie la session même si l’appel échoue', async () => {
    const store = setup({
      logout: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
    });
    store.signIn(claire);
    await expect(store.logout()).resolves.toBeUndefined();
    expect(store.authenticated()).toBe(false);
  });
});
