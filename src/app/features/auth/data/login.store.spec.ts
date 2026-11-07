import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { LoginApi } from './login.api';
import { LoginStore } from './login.store';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

const credentials = { email: 'claire@example.test', password: 'secret', rememberMe: false };

function setup(login: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      LoginStore,
      { provide: LoginApi, useValue: { login } },
      { provide: SessionApi, useValue: {} },
    ],
  });
  return { store: TestBed.inject(LoginStore), session: TestBed.inject(SessionStore) };
}

describe('LoginStore', () => {
  it('200 : ouvre la session et renvoie le compte', async () => {
    const { store, session } = setup(
      vi.fn().mockResolvedValue({ kind: 'signed-in', user: claire }),
    );
    await expect(store.submit(credentials)).resolves.toEqual(claire);
    expect(session.me()).toEqual(claire);
    expect(store.otpRequired()).toBe(false);
  });

  it('202 otpRequired : demande le code, aucune session', async () => {
    const { store, session } = setup(vi.fn().mockResolvedValue({ kind: 'otp-required' }));
    await expect(store.submit(credentials)).resolves.toBeNull();
    expect(store.otpRequired()).toBe(true);
    expect(session.authenticated()).toBe(false);
  });

  it('401 : problème gardé pour le message unique', async () => {
    const { store } = setup(
      vi.fn().mockRejectedValue({ status: 401, code: 'INVALID_CREDENTIALS' }),
    );
    await store.submit(credentials);
    expect(store.problem()).toEqual({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(store.status()).toBe('idle');
    expect(store.lockedUntil()).toBeNull();
  });

  it('423 : verrou jusqu’à maintenant + retryAfterSeconds', async () => {
    const { store } = setup(
      vi.fn().mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 90 }),
    );
    const before = Date.now();
    await store.submit(credentials);
    const until = store.lockedUntil() ?? 0;
    expect(until).toBeGreaterThanOrEqual(before + 90_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 90_000);
    store.unlock();
    expect(store.lockedUntil()).toBeNull();
    expect(store.problem()).toBeNull();
  });
});
