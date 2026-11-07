import { TestBed } from '@angular/core/testing';

import { ConfirmEmailApi } from './confirm-email.api';
import { ConfirmEmailStore, RESEND_COOLDOWN_SECONDS } from './confirm-email.store';

function setup(api: Partial<ConfirmEmailApi>) {
  TestBed.configureTestingModule({ providers: [{ provide: ConfirmEmailApi, useValue: api }] });
  return TestBed.inject(ConfirmEmailStore);
}

describe('ConfirmEmailStore', () => {
  it('confirm : 204 → confirmed', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const store = setup({ confirm });
    const pending = store.confirmToken('jeton');
    expect(store.confirm().status).toBe('busy');
    await expect(pending).resolves.toBe('confirmed');
    expect(confirm).toHaveBeenCalledWith('jeton');
    expect(store.confirm().status).toBe('confirmed');
  });

  it('confirm : 410 TOKEN_INVALID_OR_EXPIRED → expired (déjà servi, expiré, remplacé)', async () => {
    const store = setup({
      confirm: vi.fn().mockRejectedValue({ status: 410, code: 'TOKEN_INVALID_OR_EXPIRED' }),
    });
    await expect(store.confirmToken('vieux')).resolves.toBe('expired');
    expect(store.confirm().problem?.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('confirm : réseau ou serveur → error, à réessayer', async () => {
    const store = setup({
      confirm: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
    });
    await expect(store.confirmToken('jeton')).resolves.toBe('error');
    expect(store.confirm().status).toBe('error');
  });

  it('resend : 202 → done, adresse mémorisée, prochain renvoi dans 60 s', async () => {
    const resend = vi.fn().mockResolvedValue(undefined);
    const store = setup({ resend });
    const before = Date.now();
    await expect(store.resendEmail(' alix@example.test ')).resolves.toBe(true);
    expect(resend).toHaveBeenCalledWith('alix@example.test');
    expect(store.email()).toBe('alix@example.test');
    expect(store.resend().status).toBe('done');
    const allowedAt = store.resendAllowedAt() ?? 0;
    expect(allowedAt).toBeGreaterThanOrEqual(before + RESEND_COOLDOWN_SECONDS * 1000);
    expect(allowedAt).toBeLessThanOrEqual(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    store.clearCooldown();
    expect(store.resendAllowedAt()).toBeNull();
  });

  it('resend : sans adresse connue ni saisie, rien ne part', async () => {
    const resend = vi.fn();
    const store = setup({ resend });
    await expect(store.resendEmail()).resolves.toBe(false);
    expect(resend).not.toHaveBeenCalled();
  });

  it('resend : 422 → error, problème gardé pour le message', async () => {
    const store = setup({
      resend: vi.fn().mockRejectedValue({ status: 422, code: 'VALIDATION_FAILED' }),
    });
    store.remember('alix@example.test');
    await expect(store.resendEmail()).resolves.toBe(false);
    expect(store.resend().status).toBe('error');
    expect(store.resend().problem?.status).toBe(422);
    expect(store.resendAllowedAt()).toBeNull();
  });

  it('changeEmail : 202 → la carte affiche la nouvelle adresse, le délai repart', async () => {
    const changeEmail = vi.fn().mockResolvedValue(undefined);
    const store = setup({ changeEmail });
    store.remember('ancienne@example.test');
    await expect(store.changeEmail('Secret-123456', ' nouvelle@example.test ')).resolves.toBe(true);
    expect(changeEmail).toHaveBeenCalledWith(
      'ancienne@example.test',
      'Secret-123456',
      'nouvelle@example.test',
    );
    expect(store.email()).toBe('nouvelle@example.test');
    expect(store.change().status).toBe('done');
    expect(store.resendAllowedAt()).not.toBeNull();
    store.resetChange();
    expect(store.change().status).toBe('idle');
  });

  it('changeEmail : 423 → error avec retryAfterSeconds, adresse inchangée', async () => {
    const store = setup({
      changeEmail: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 300 }),
    });
    store.remember('ancienne@example.test');
    await expect(store.changeEmail('faux', 'nouvelle@example.test')).resolves.toBe(false);
    expect(store.email()).toBe('ancienne@example.test');
    expect(store.change().problem?.retryAfterSeconds).toBe(300);
  });

  it('checkSession : 200 → état à jour et adresse mémorisée ; 401 → null', async () => {
    const session = vi
      .fn()
      .mockResolvedValueOnce({
        email: 'alix@example.test',
        emailConfirmed: true,
        verificationStatus: 'docs_pending',
      })
      .mockRejectedValueOnce({ status: 401, code: 'UNAUTHENTICATED' });
    const store = setup({ session });
    await expect(store.checkSession()).resolves.toEqual({
      email: 'alix@example.test',
      emailConfirmed: true,
      verificationStatus: 'docs_pending',
    });
    expect(store.email()).toBe('alix@example.test');
    await expect(store.checkSession()).resolves.toBeNull();
  });
});
