import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { SecurityApi } from './security.api';
import { TwoFactorStore } from './two-factor.store';

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

const ENROLLMENT = {
  secret: 'JBSWY3DPEHPK3PXP7Q4MN5A2KZ6RH3LT',
  otpauthUri: 'otpauth://totp/PsyMate:claire@example.test?secret=JBSWY3DPEHPK3PXP&issuer=PsyMate',
};
const CODES = Array.from({ length: 10 }, (_, i) => `CODE${i}-XXXXX`);

function setup(
  api: Partial<SecurityApi>,
  meAfter: SessionUser = { ...claire, twoFactorEnabled: true },
) {
  const me = vi.fn().mockResolvedValue(meAfter);
  TestBed.configureTestingModule({
    providers: [
      TwoFactorStore,
      { provide: SecurityApi, useValue: api },
      { provide: SessionApi, useValue: { me } },
    ],
  });
  const session = TestBed.inject(SessionStore);
  session.signIn(claire);
  return { store: TestBed.inject(TwoFactorStore), session, me };
}

describe('TwoFactorStore', () => {
  it('start : chargement puis secret et URI (étape scan)', async () => {
    const { store } = setup({ enableTwoFactor: vi.fn().mockResolvedValue(ENROLLMENT) });
    const pending = store.start();
    expect(store.enrollment().status).toBe('loading');
    await pending;
    expect(store.secret()).toBe(ENROLLMENT.secret);
    expect(store.otpauthUri()).toBe(ENROLLMENT.otpauthUri);
    expect(store.step()).toBe('scan');
  });

  it('start 409 TWO_FACTOR_ALREADY_ENABLED : état erreur, rien à afficher', async () => {
    const { store } = setup({
      enableTwoFactor: vi
        .fn()
        .mockRejectedValue({ status: 409, code: 'TWO_FACTOR_ALREADY_ENABLED' }),
    });
    await store.start();
    expect(store.enrollment().status).toBe('error');
    expect(store.enrollment().problem?.code).toBe('TWO_FACTOR_ALREADY_ENABLED');
    expect(store.secret()).toBe('');
  });

  it('verify : 10 codes, étape codes, secret oublié, session relue (twoFactorEnabled)', async () => {
    const verifyTwoFactor = vi.fn().mockResolvedValue(CODES);
    const { store, session, me } = setup({
      enableTwoFactor: vi.fn().mockResolvedValue(ENROLLMENT),
      verifyTwoFactor,
    });
    await store.start();
    store.goTo('code');
    await expect(store.verify('123456')).resolves.toBe(true);
    expect(verifyTwoFactor).toHaveBeenCalledWith('123456');
    expect(store.codes()).toEqual(CODES);
    expect(store.step()).toBe('codes');
    expect(store.secret()).toBe('');
    expect(me).toHaveBeenCalled();
    expect(session.twoFactorEnabled()).toBe(true);
  });

  it('verify 422 INVALID_CODE : erreur gardée, pas de codes, pas de verrou', async () => {
    const { store, session } = setup({
      verifyTwoFactor: vi.fn().mockRejectedValue({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'code', code: 'INVALID_CODE', message: 'Code incorrect.' }],
      }),
    });
    await expect(store.verify('000000')).resolves.toBe(false);
    expect(store.verification().status).toBe('error');
    expect(store.verification().problem?.status).toBe(422);
    expect(store.verification().lockedUntil).toBeNull();
    expect(store.codes()).toEqual([]);
    expect(session.twoFactorEnabled()).toBe(false);
  });

  it('verify 423 : verrou jusqu’à maintenant + retryAfterSeconds, unlock le lève', async () => {
    const { store } = setup({
      verifyTwoFactor: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 60 }),
    });
    const before = Date.now();
    await store.verify('000000');
    const until = store.verification().lockedUntil ?? 0;
    expect(until).toBeGreaterThanOrEqual(before + 60_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 60_000);
    store.unlock();
    expect(store.verification().lockedUntil).toBeNull();
    expect(store.verification().problem).toBeNull();
  });

  it('regenerate : chargement puis 10 nouveaux codes ; 409 en erreur', async () => {
    const regenerateRecoveryCodes = vi
      .fn()
      .mockResolvedValueOnce(CODES)
      .mockRejectedValueOnce({ status: 409, code: 'TWO_FACTOR_NOT_ENABLED' });
    const { store } = setup({ regenerateRecoveryCodes });
    const pending = store.regenerate();
    expect(store.recoveryCodes().status).toBe('loading');
    expect(store.step()).toBe('codes');
    await pending;
    expect(store.codes()).toEqual(CODES);
    await store.regenerate();
    expect(store.recoveryCodes().status).toBe('error');
    expect(store.recoveryCodes().problem?.code).toBe('TWO_FACTOR_NOT_ENABLED');
  });

  it('disable : 204 → session relue ; 422 et 409 gardés en erreur', async () => {
    const disableTwoFactor = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [
          { field: 'password', code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' },
        ],
      })
      .mockRejectedValueOnce({ status: 409, code: 'TWO_FACTOR_REQUIRED_FOR_ADMIN' });
    const { store, me } = setup({ disableTwoFactor }, { ...claire, twoFactorEnabled: false });
    await expect(store.disable('secret', '123456')).resolves.toBe(true);
    expect(disableTwoFactor).toHaveBeenCalledWith('secret', '123456');
    expect(me).toHaveBeenCalledTimes(1);
    await expect(store.disable('faux', '123456')).resolves.toBe(false);
    expect(store.disabling().problem?.errors?.[0].code).toBe('INVALID_PASSWORD');
    await expect(store.disable('secret', '123456')).resolves.toBe(false);
    expect(store.disabling().problem?.code).toBe('TWO_FACTOR_REQUIRED_FOR_ADMIN');
  });

  it('reset : secret et codes oubliés', async () => {
    const { store } = setup({
      enableTwoFactor: vi.fn().mockResolvedValue(ENROLLMENT),
      verifyTwoFactor: vi.fn().mockResolvedValue(CODES),
    });
    await store.start();
    await store.verify('123456');
    store.reset();
    expect(store.codes()).toEqual([]);
    expect(store.secret()).toBe('');
    expect(store.step()).toBe('scan');
  });
});
