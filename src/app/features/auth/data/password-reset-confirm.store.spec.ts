import { TestBed } from '@angular/core/testing';

import { PasswordResetConfirmStore } from './password-reset-confirm.store';
import { RegisterApi } from './register.api';

function setup(confirmPasswordReset: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      PasswordResetConfirmStore,
      { provide: RegisterApi, useValue: { confirmPasswordReset } },
    ],
  });
  return TestBed.inject(PasswordResetConfirmStore);
}

describe('PasswordResetConfirmStore', () => {
  it('204 → done ; jeton et mot de passe transmis tels quels', async () => {
    const api = vi.fn().mockResolvedValue(undefined);
    const store = setup(api);
    expect(await store.confirmReset('jeton', 'Vendôme-Lyon-2026!x')).toBe('done');
    expect(api).toHaveBeenCalledWith('jeton', 'Vendôme-Lyon-2026!x');
    expect(store.status()).toBe('done');
    expect(store.problem()).toBeNull();
  });

  it('410 → expired, sans problème affiché', async () => {
    const store = setup(
      vi.fn().mockRejectedValue({ status: 410, code: 'TOKEN_INVALID_OR_EXPIRED' }),
    );
    expect(await store.confirmReset('vieux', 'Vendôme-Lyon-2026!x')).toBe('expired');
    expect(store.status()).toBe('expired');
    expect(store.problem()).toBeNull();
  });

  it('422 → error, problème conservé pour la page (errors[] sur password)', async () => {
    const problem = {
      status: 422,
      code: 'PASSWORD_POLICY',
      errors: [{ field: 'password', code: 'PASSWORD_CASE', message: 'Majuscules et minuscules.' }],
    };
    const store = setup(vi.fn().mockRejectedValue(problem));
    expect(await store.confirmReset('jeton', 'tout-en-minuscules-2026')).toBe('error');
    expect(store.status()).toBe('idle');
    expect(store.problem()?.code).toBe('PASSWORD_POLICY');
    expect(store.problem()?.errors?.[0].field).toBe('password');
  });

  it('markExpired : lien sans jeton, aucun appel', () => {
    const api = vi.fn();
    const store = setup(api);
    store.markExpired();
    expect(store.status()).toBe('expired');
    expect(api).not.toHaveBeenCalled();
  });
});
