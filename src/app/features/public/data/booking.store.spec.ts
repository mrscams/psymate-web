import { TestBed } from '@angular/core/testing';

import { BookingApi } from './booking.api';
import { bookingRequest, CLAIRE_BOOKING, NO_SLOTS, SLOTS } from './booking.fixtures';
import { BOOKING_MIN_DELAY_MS, BookingStore } from './booking.store';
import { addDays, hasNextWindow, todayIn, windowAt } from './booking-window';

function setup(api: Partial<Record<keyof BookingApi, ReturnType<typeof vi.fn>>>) {
  const mock = {
    settings: vi.fn().mockResolvedValue(CLAIRE_BOOKING),
    slots: vi.fn().mockResolvedValue(SLOTS),
    request: vi.fn().mockResolvedValue(undefined),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [BookingStore, { provide: BookingApi, useValue: mock }],
  });
  return { store: TestBed.inject(BookingStore), api: mock };
}

// 22 novembre 2026, 23:30 UTC : déjà le 23 à Paris.
const NOW = new Date('2026-11-22T23:30:00Z');

describe('fenêtres de créneaux (fiche 31)', () => {
  it('aujourd’hui dans le fuseau du praticien, pas celui du navigateur', () => {
    expect(todayIn('Europe/Paris', NOW)).toBe('2026-11-23');
    expect(todayIn('America/Montreal', NOW)).toBe('2026-11-22');
  });

  it('chaque fenêtre fait 14 jours, la suivante commence 14 jours plus loin', () => {
    expect(windowAt('2026-11-23', 0)).toEqual({ from: '2026-11-23', to: '2026-12-06' });
    expect(windowAt('2026-11-23', 1)).toEqual({ from: '2026-12-07', to: '2026-12-20' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('« Semaines suivantes » inactif quand la fenêtre suivante commence après l’horizon', () => {
    // horizon 28 : fenêtre 1 (J+14) et 2 (J+28) offertes, la 3 (J+42) non.
    expect(hasNextWindow('2026-11-23', 0, 28)).toBe(true);
    expect(hasNextWindow('2026-11-23', 1, 28)).toBe(true);
    expect(hasNextWindow('2026-11-23', 2, 28)).toBe(false);
    expect(hasNextWindow('2026-11-23', 0, 7)).toBe(false);
  });
});

describe('BookingStore', () => {
  afterEach(() => vi.useRealTimers());

  it('charge les réglages puis la première fenêtre (aujourd’hui + 13 jours, fuseau du praticien)', async () => {
    const { store, api } = setup({});
    const pending = store.load('claire-martin', NOW);
    expect(store.settings().status).toBe('loading');
    await pending;
    expect(api.settings).toHaveBeenCalledWith('claire-martin');
    expect(api.slots).toHaveBeenCalledWith('claire-martin', {
      from: '2026-11-23',
      to: '2026-12-06',
    });
    expect(store.today()).toBe('2026-11-23');
    expect(store.settings().data?.displayName).toBe('Claire Martin');
    expect(store.slots().data?.slots).toEqual(SLOTS.slots);
  });

  it('trois états des créneaux : chargement, vide, erreur', async () => {
    let resolve!: (value: unknown) => void;
    const slots = vi
      .fn()
      .mockReturnValueOnce(new Promise((r) => (resolve = r)))
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    const { store } = setup({ slots });
    const pending = store.load('claire-martin', NOW);
    await vi.waitFor(() => expect(slots).toHaveBeenCalled());
    expect(store.slots().status).toBe('loading');
    resolve(NO_SLOTS);
    await pending;
    expect(store.slots().status).toBe('loaded');
    expect(store.slots().data?.slots).toEqual([]);
    await store.loadSlots(windowAt('2026-11-23', 1));
    expect(store.slots().status).toBe('error');
    expect(store.slots().problem?.status).toBe(503);
    expect(store.window()).toEqual({ from: '2026-12-07', to: '2026-12-20' });
  });

  it('404 BOOKING_NOT_AVAILABLE sur les réglages : notAvailable, aucun créneau demandé', async () => {
    const { store, api } = setup({
      settings: vi.fn().mockRejectedValue({ status: 404, code: 'BOOKING_NOT_AVAILABLE' }),
    });
    await store.load('inconnue', NOW);
    expect(store.notAvailable()).toBe(true);
    expect(api.slots).not.toHaveBeenCalled();
  });

  it('429 sur les réglages : erreur avec le délai, pas notAvailable', async () => {
    const { store } = setup({
      settings: vi
        .fn()
        .mockRejectedValue({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 61 }),
    });
    await store.load('claire-martin', NOW);
    expect(store.notAvailable()).toBe(false);
    expect(store.settings().problem?.retryAfterSeconds).toBe(61);
  });

  it('envoi : 202 → sent, avec le slug et la demande telle que saisie', async () => {
    const { store, api } = setup({});
    await store.load('claire-martin', NOW);
    const request = bookingRequest(Date.now() - 10_000);
    await expect(store.send(request)).resolves.toEqual({ outcome: 'sent', problem: null });
    expect(api.request).toHaveBeenCalledWith('claire-martin', request);
  });

  it('envoi trop rapide : attend 3,5 s après formShownAt avant de partir', async () => {
    vi.useFakeTimers();
    const { store, api } = setup({});
    await store.load('claire-martin', NOW);
    const shownAt = Date.now();
    const pending = store.send(bookingRequest(shownAt), shownAt + 1000);
    await vi.advanceTimersByTimeAsync(BOOKING_MIN_DELAY_MS - 1000 - 10);
    expect(api.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await pending;
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('409 SLOT_NOT_AVAILABLE : slot-gone, et les créneaux sont relus par un nouveau GET', async () => {
    const fresh = { ...SLOTS, slots: SLOTS.slots.slice(1) };
    const slots = vi.fn().mockResolvedValueOnce(SLOTS).mockResolvedValueOnce(fresh);
    const { store } = setup({
      slots,
      request: vi.fn().mockRejectedValue({ status: 409, code: 'SLOT_NOT_AVAILABLE' }),
    });
    await store.load('claire-martin', NOW);
    const result = await store.send(bookingRequest(Date.now() - 10_000));
    expect(result.outcome).toBe('slot-gone');
    expect(slots).toHaveBeenCalledTimes(2);
    expect(slots.mock.calls[1][1]).toEqual(slots.mock.calls[0][1]);
    // Relus, jamais corrigés localement : la liste est celle de la nouvelle réponse.
    expect(store.slots().data?.slots).toEqual(fresh.slots);
  });

  it.each([
    [{ status: 422, code: 'VALIDATION_FAILED', errors: [] }, 'invalid'],
    [{ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 2520 }, 'rate-limited'],
    [{ status: 404, code: 'BOOKING_NOT_AVAILABLE' }, 'not-available'],
    [{ status: 400, code: 'MALFORMED_REQUEST' }, 'error'],
    [{ status: 0, code: 'NETWORK_ERROR' }, 'error'],
  ])('%o → %s, problème transmis à l’écran', async (problem, outcome) => {
    const { store } = setup({ request: vi.fn().mockRejectedValue(problem) });
    await store.load('claire-martin', NOW);
    const result = await store.send(bookingRequest(Date.now() - 10_000));
    expect(result).toEqual({ outcome, problem });
  });
});
