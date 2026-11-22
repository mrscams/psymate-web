import { TestBed } from '@angular/core/testing';

import { BookingApi } from './booking.api';
import { appointment, MANAGE_TOKEN, VERIFY_TOKEN } from './booking-link.fixtures';
import { BookingLinkStore } from './booking-link.store';

type Mock = Partial<Record<keyof BookingApi, ReturnType<typeof vi.fn>>>;

function setup(api: Mock) {
  const mock = {
    verify: vi.fn().mockResolvedValue(appointment({ manageToken: MANAGE_TOKEN })),
    manage: vi.fn().mockResolvedValue(appointment()),
    cancel: vi.fn().mockResolvedValue(appointment({ status: 'cancelled' })),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [BookingLinkStore, { provide: BookingApi, useValue: mock }],
  });
  return { store: TestBed.inject(BookingLinkStore), api: mock };
}

describe('BookingLinkStore (fiche 32)', () => {
  it('verify : chargement, puis la réponse ; le jeton part tel quel vers le service', async () => {
    const { store, api } = setup({});
    expect(store.verification().status).toBe('idle');
    const pending = store.verify(VERIFY_TOKEN);
    expect(store.verification().status).toBe('loading');
    await pending;
    expect(api.verify).toHaveBeenCalledWith(VERIFY_TOKEN);
    expect(store.verification().status).toBe('loaded');
    expect(store.verification().data?.manageToken).toBe(MANAGE_TOKEN);
  });

  it.each([
    [404, 'BOOKING_TOKEN_INVALID'],
    [410, 'BOOKING_TOKEN_EXPIRED'],
    [409, 'SLOT_TAKEN'],
    [409, 'BOOKING_ALREADY_ACTIVE'],
    [404, 'BOOKING_NOT_AVAILABLE'],
    [422, 'VALIDATION_FAILED'],
    [429, 'RATE_LIMITED'],
    [0, 'NETWORK_ERROR'],
  ])('verify : %i %s devient l’état erreur avec son ApiProblem', async (status, code) => {
    const { store } = setup({ verify: vi.fn().mockRejectedValue({ status, code }) });
    await store.verify(VERIFY_TOKEN);
    expect(store.verification().status).toBe('error');
    expect(store.verification().problem).toMatchObject({ status, code });
  });

  it('manage : trois états (chargement, données, erreur)', async () => {
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    const { store } = setup({ manage });
    const pending = store.loadManaged(MANAGE_TOKEN);
    expect(store.managed().status).toBe('loading');
    await pending;
    expect(store.managed().data?.status).toBe('confirmed');
    await store.loadManaged(MANAGE_TOKEN);
    expect(store.managed().status).toBe('error');
    expect(store.managed().problem?.status).toBe(503);
  });

  it('cancel 200 : POST …/manage/cancel puis relecture par POST …/manage, jamais de correction locale', async () => {
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockResolvedValueOnce(
        appointment({ status: 'cancelled', cancelledBy: 'visitor', canCancel: false }),
      );
    // La réponse de cancel n'est pas recopiée : c'est la relecture qui fait foi.
    const cancel = vi.fn().mockResolvedValue(appointment({ status: 'past' }));
    const { store } = setup({ manage, cancel });
    await store.loadManaged(MANAGE_TOKEN);
    const pending = store.cancel(MANAGE_TOKEN);
    // Pendant l'annulation et la relecture, l'état affiché reste.
    expect(store.managed().data?.status).toBe('confirmed');
    const result = await pending;
    expect(result.outcome).toBe('cancelled');
    expect(cancel).toHaveBeenCalledWith(MANAGE_TOKEN);
    expect(manage).toHaveBeenCalledTimes(2);
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(manage.mock.invocationCallOrder[1]);
    expect(store.managed().data).toMatchObject({ status: 'cancelled', cancelledBy: 'visitor' });
  });

  it('cancel 409 APPOINTMENT_NOT_ACTIVE : issue too-late et état relu', async () => {
    const manage = vi
      .fn()
      .mockResolvedValueOnce(appointment({ status: 'confirmed' }))
      .mockResolvedValueOnce(appointment({ status: 'confirmed', canCancel: false }));
    const { store } = setup({
      manage,
      cancel: vi.fn().mockRejectedValue({ status: 409, code: 'APPOINTMENT_NOT_ACTIVE' }),
    });
    await store.loadManaged(MANAGE_TOKEN);
    const result = await store.cancel(MANAGE_TOKEN);
    expect(result.outcome).toBe('too-late');
    expect(manage).toHaveBeenCalledTimes(2);
    expect(store.managed().data?.canCancel).toBe(false);
  });

  it.each([
    [429, 'RATE_LIMITED', 'rate-limited'],
    [404, 'BOOKING_TOKEN_INVALID', 'link-invalid'],
    [422, 'VALIDATION_FAILED', 'link-invalid'],
    [503, 'INTERNAL_ERROR', 'error'],
    [0, 'NETWORK_ERROR', 'error'],
  ])(
    'cancel %i %s : issue %s, état affiché inchangé, aucune relecture',
    async (status, code, outcome) => {
      const { store, api } = setup({ cancel: vi.fn().mockRejectedValue({ status, code }) });
      await store.loadManaged(MANAGE_TOKEN);
      const before = store.managed();
      const result = await store.cancel(MANAGE_TOKEN);
      expect(result.outcome).toBe(outcome);
      expect(result.problem).toMatchObject({ status, code });
      expect(api.manage).toHaveBeenCalledTimes(1);
      expect(store.managed()).toBe(before);
    },
  );
});
