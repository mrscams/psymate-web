import { TestBed } from '@angular/core/testing';

import { EmailChangeStore, PasswordChangeStore } from './credentials.store';
import { SecurityApi } from './security.api';

const INPUT = {
  email: 'claire@example.test',
  currentPassword: 'Ancien-Mot-De-Passe-1',
  newPassword: 'Nouveau-Mot-De-Passe-2',
};

function setup(api: Partial<SecurityApi>) {
  TestBed.configureTestingModule({
    providers: [PasswordChangeStore, EmailChangeStore, { provide: SecurityApi, useValue: api }],
  });
  return {
    password: TestBed.inject(PasswordChangeStore),
    email: TestBed.inject(EmailChangeStore),
  };
}

describe('PasswordChangeStore', () => {
  it('204 : vrai, aucun code demandé', async () => {
    const changePassword = vi.fn().mockResolvedValue('changed');
    const { password } = setup({ changePassword });
    await expect(password.submit(INPUT)).resolves.toBe(true);
    expect(changePassword).toHaveBeenCalledWith(INPUT);
    expect(password.otpRequired()).toBe(false);
    expect(password.action().status).toBe('idle');
  });

  it('202 otpRequired : faux, le champ code s’affiche, puis renvoi avec otp', async () => {
    const changePassword = vi
      .fn()
      .mockResolvedValueOnce('otp-required')
      .mockResolvedValueOnce('changed');
    const { password } = setup({ changePassword });
    await expect(password.submit(INPUT)).resolves.toBe(false);
    expect(password.otpRequired()).toBe(true);
    expect(password.action().problem).toBeNull();
    await expect(password.submit({ ...INPUT, otp: '123456' })).resolves.toBe(true);
    expect(changePassword).toHaveBeenLastCalledWith({ ...INPUT, otp: '123456' });
  });

  it('422 PASSWORD_POLICY : erreur gardée avec errors[] ; 401 et 423 (verrou)', async () => {
    const policy = {
      status: 422,
      code: 'PASSWORD_POLICY',
      errors: [{ field: 'password', code: 'PASSWORD_TOO_SHORT', message: 'Trop court.' }],
    };
    const changePassword = vi
      .fn()
      .mockRejectedValueOnce(policy)
      .mockRejectedValueOnce({ status: 401, code: 'INVALID_CREDENTIALS' })
      .mockRejectedValueOnce({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 30 });
    const { password } = setup({ changePassword });
    await expect(password.submit(INPUT)).resolves.toBe(false);
    expect(password.action().problem).toEqual(policy);
    expect(password.action().lockedUntil).toBeNull();
    await password.submit(INPUT);
    expect(password.action().problem?.status).toBe(401);
    await password.submit(INPUT);
    expect(password.action().lockedUntil).toBeGreaterThan(Date.now());
    password.unlock();
    expect(password.action().lockedUntil).toBeNull();
  });
});

describe('EmailChangeStore', () => {
  it('202 : vrai, nouvelle adresse mémorisée', async () => {
    const changeEmail = vi.fn().mockResolvedValue(undefined);
    const { email } = setup({ changeEmail });
    await expect(email.submit('nouvelle@example.test', 'secret')).resolves.toBe(true);
    expect(changeEmail).toHaveBeenCalledWith('nouvelle@example.test', 'secret');
    expect(email.sentTo()).toBe('nouvelle@example.test');
  });

  it('422 INVALID_PASSWORD (G Q49) : faux, erreur gardée ; 423 verrou par compte', async () => {
    const changeEmail = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [
          { field: 'password', code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' },
        ],
      })
      .mockRejectedValueOnce({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 });
    const { email } = setup({ changeEmail });
    await expect(email.submit('nouvelle@example.test', 'faux')).resolves.toBe(false);
    expect(email.sentTo()).toBeNull();
    expect(email.action().problem?.errors?.[0].code).toBe('INVALID_PASSWORD');
    await email.submit('nouvelle@example.test', 'faux');
    expect(email.action().lockedUntil).toBeGreaterThan(Date.now() + 800_000);
  });
});
