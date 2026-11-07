import { TestBed } from '@angular/core/testing';

import { RegisterApi, RegisterInput } from './register.api';
import { PasswordResetStore, RegisterStore } from './register.store';

const input: RegisterInput = {
  firstName: 'Alix',
  lastName: 'Essai',
  email: 'alix@example.test',
  password: 'Vendôme-Lyon-2026!x',
  profession: 'coach',
  professionalNumber: '',
  phone: '+33600000099',
  remoteOnly: true,
  address: { street: '', postalCode: '', city: '' },
  consents: { terms: true, privacy: true },
};

function setup(api: Partial<RegisterApi>) {
  TestBed.configureTestingModule({
    providers: [RegisterStore, PasswordResetStore, { provide: RegisterApi, useValue: api }],
  });
  return {
    register: TestBed.inject(RegisterStore),
    reset: TestBed.inject(PasswordResetStore),
  };
}

describe('RegisterStore', () => {
  it('201 : passe en sent et renvoie vrai', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const { register: store } = setup({ register });
    await expect(store.submit(input)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith(input);
    expect(store.status()).toBe('sent');
    expect(store.problem()).toBeNull();
  });

  it('422 : garde le problème avec ses errors[] pour les champs', async () => {
    const problem = {
      status: 422,
      code: 'PASSWORD_POLICY',
      errors: [{ field: 'password', code: 'PASSWORD_COMPROMISED', message: 'Mot de passe connu.' }],
    };
    const { register: store } = setup({ register: vi.fn().mockRejectedValue(problem) });
    await expect(store.submit(input)).resolves.toBe(false);
    expect(store.status()).toBe('idle');
    expect(store.problem()).toEqual(problem);
  });

  it('erreur inconnue : problème client, statut idle', async () => {
    const { register: store } = setup({ register: vi.fn().mockRejectedValue(new Error('boom')) });
    await store.submit(input);
    expect(store.problem()?.status).toBe(0);
  });
});

describe('PasswordResetStore', () => {
  it('202 : sent, quel que soit le compte', async () => {
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined);
    const { reset } = setup({ requestPasswordReset });
    await expect(reset.request('x@example.test')).resolves.toBe(true);
    expect(requestPasswordReset).toHaveBeenCalledWith('x@example.test');
    expect(reset.status()).toBe('sent');
  });

  it('422 : problème gardé', async () => {
    const { reset } = setup({
      requestPasswordReset: vi.fn().mockRejectedValue({ status: 422, code: 'VALIDATION_FAILED' }),
    });
    await expect(reset.request('x')).resolves.toBe(false);
    expect(reset.problem()?.status).toBe(422);
  });
});
