import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { FirstLoginApi } from './first-login.api';
import { FirstLoginStore } from './first-login.store';
import { LoginApi } from './login.api';

const admin: SessionUser = {
  id: 'a1',
  email: 'hushan@example.test',
  displayName: 'Administrateur',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'admin',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

const INPUT = {
  email: admin.email,
  currentPassword: 'MotDePasseTemporaire20',
  newPassword: 'Nouveau-Mot-De-Passe-2026',
};

function setup(changePassword: ReturnType<typeof vi.fn>, login = vi.fn()) {
  TestBed.configureTestingModule({
    providers: [
      FirstLoginStore,
      { provide: FirstLoginApi, useValue: { changePassword } },
      { provide: LoginApi, useValue: { login } },
      { provide: SessionApi, useValue: {} },
    ],
  });
  return { store: TestBed.inject(FirstLoginStore), session: TestBed.inject(SessionStore), login };
}

describe('FirstLoginStore', () => {
  it('204 puis login 200 : session ouverte avec le nouveau mot de passe (fiche 18 C)', async () => {
    const { store, session, login } = setup(
      vi.fn().mockResolvedValue('changed'),
      vi.fn().mockResolvedValue({ kind: 'signed-in', user: admin }),
    );
    await expect(store.changePassword(INPUT)).resolves.toBe('signed-in');
    expect(login).toHaveBeenCalledWith({
      email: admin.email,
      password: INPUT.newPassword,
      rememberMe: false,
    });
    expect(session.me()).toEqual(admin);
    expect(store.status()).toBe('idle');
  });

  it('202 otpRequired : le code est demandé, aucun login tenté', async () => {
    const { store, login, session } = setup(vi.fn().mockResolvedValue('otp-required'));
    await expect(store.changePassword(INPUT)).resolves.toBe('otp-required');
    expect(store.otpRequired()).toBe(true);
    expect(login).not.toHaveBeenCalled();
    expect(session.authenticated()).toBe(false);
  });

  it('204 puis login 202 (2FA active) : retour à la connexion', async () => {
    const { store, session } = setup(
      vi.fn().mockResolvedValue('changed'),
      vi.fn().mockResolvedValue({ kind: 'otp-required' }),
    );
    await expect(store.changePassword(INPUT)).resolves.toBe('relogin');
    expect(session.authenticated()).toBe(false);
  });

  it('401, 422 et 423 : échec gardé, verrou sur 423', async () => {
    const changePassword = vi
      .fn()
      .mockRejectedValueOnce({ status: 401, code: 'INVALID_CREDENTIALS' })
      .mockRejectedValueOnce({ status: 422, code: 'PASSWORD_POLICY', errors: [] })
      .mockRejectedValueOnce({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 45 });
    const { store } = setup(changePassword);
    await expect(store.changePassword(INPUT)).resolves.toBe('failed');
    expect(store.problem()?.status).toBe(401);
    expect(store.lockedUntil()).toBeNull();
    await store.changePassword(INPUT);
    expect(store.problem()?.code).toBe('PASSWORD_POLICY');
    const before = Date.now();
    await store.changePassword(INPUT);
    expect(store.lockedUntil()).toBeGreaterThanOrEqual(before + 45_000);
    store.unlock();
    expect(store.lockedUntil()).toBeNull();
    expect(store.problem()).toBeNull();
  });
});
