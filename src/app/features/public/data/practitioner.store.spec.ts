import { TestBed } from '@angular/core/testing';

import { DirectoryApi } from './directory.api';
import { CLAIRE_PROFILE } from './directory.fixtures';
import { ContactMessage } from './directory.models';
import { CONTACT_MIN_DELAY_MS, PractitionerStore } from './practitioner.store';
import { VocabularyStore } from './vocabulary.store';

function setup(api: Partial<DirectoryApi>) {
  TestBed.configureTestingModule({
    providers: [PractitionerStore, { provide: DirectoryApi, useValue: api }],
  });
  return TestBed.inject(PractitionerStore);
}

function message(shownAt: number): ContactMessage {
  return {
    name: 'Sam Visiteur',
    email: 'sam@example.test',
    subject: 'Demande de premier rendez-vous',
    message: 'Bonjour, avez-vous des disponibilités ?',
    consent: true,
    website: '',
    formShownAt: new Date(shownAt).toISOString(),
  };
}

describe('PractitionerStore', () => {
  afterEach(() => vi.useRealTimers());

  it('charge la fiche publiée', async () => {
    const profile = vi.fn().mockResolvedValue(CLAIRE_PROFILE);
    const store = setup({ profile });
    const pending = store.load('claire-moreau');
    expect(store.profile().status).toBe('loading');
    await pending;
    expect(profile).toHaveBeenCalledWith('claire-moreau');
    expect(store.profile().data?.displayName).toBe('Claire Moreau');
    expect(store.notFound()).toBe(false);
  });

  it('404 PROFILE_NOT_FOUND : notFound (profil inconnu ou non publié)', async () => {
    const store = setup({
      profile: vi.fn().mockRejectedValue({ status: 404, code: 'PROFILE_NOT_FOUND' }),
    });
    await store.load('inconnue');
    expect(store.notFound()).toBe(true);
    expect(store.profile().status).toBe('error');
  });

  it('envoi : 202 → sent, avec le slug et le message tel que saisi', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const store = setup({ profile: vi.fn().mockResolvedValue(CLAIRE_PROFILE), sendMessage });
    await store.load('claire-moreau');
    const shownAt = Date.now() - 10_000;
    await expect(store.send(message(shownAt))).resolves.toBe('sent');
    expect(sendMessage).toHaveBeenCalledWith('claire-moreau', message(shownAt));
    expect(store.contact().status).toBe('sent');
  });

  it('délai minimal : un envoi trop rapide attend la fin des 3 s avant de partir', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const store = setup({ profile: vi.fn().mockResolvedValue(CLAIRE_PROFILE), sendMessage });
    await store.load('claire-moreau');
    const now = Date.now();
    const pending = store.send(message(now - 1000), now);
    expect(store.contact().status).toBe('sending');
    await vi.advanceTimersByTimeAsync(CONTACT_MIN_DELAY_MS - 1000 - 10);
    expect(sendMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await expect(pending).resolves.toBe('sent');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('422 → invalid (erreurs à poser sur les champs) ; 429 → rate-limited avec le délai', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'email', code: '', message: 'Adresse invalide' }],
      })
      .mockRejectedValueOnce({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 1200 });
    const store = setup({ profile: vi.fn().mockResolvedValue(CLAIRE_PROFILE), sendMessage });
    await store.load('claire-moreau');
    await expect(store.send(message(Date.now() - 10_000))).resolves.toBe('invalid');
    expect(store.contact().problem?.errors?.[0].field).toBe('email');

    const before = Date.now();
    await expect(store.send(message(Date.now() - 10_000))).resolves.toBe('rate-limited');
    expect(store.contact().retryAt ?? 0).toBeGreaterThanOrEqual(before + 1_200_000);
    store.resetContact();
    expect(store.contact().status).toBe('idle');
  });

  it('réseau coupé → error (saisie conservée par le formulaire)', async () => {
    const store = setup({
      profile: vi.fn().mockResolvedValue(CLAIRE_PROFILE),
      sendMessage: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
    });
    await store.load('claire-moreau');
    await expect(store.send(message(Date.now() - 10_000))).resolves.toBe('error');
  });
});

describe('VocabularyStore', () => {
  it('un seul appel, même demandé deux fois ; réutilisé ensuite', async () => {
    const vocabulary = vi.fn().mockResolvedValue({
      specialties: [],
      audiences: [],
      modalities: [],
      languages: [],
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DirectoryApi, useValue: { vocabulary } }],
    });
    const store = TestBed.inject(VocabularyStore);
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();
    expect(vocabulary).toHaveBeenCalledTimes(1);
    expect(store.lists()).not.toBeNull();
  });

  it('échec : lists null, un nouvel essai repart', async () => {
    const vocabulary = vi.fn().mockRejectedValue({ status: 503, code: 'INTERNAL_ERROR' });
    TestBed.configureTestingModule({
      providers: [{ provide: DirectoryApi, useValue: { vocabulary } }],
    });
    const store = TestBed.inject(VocabularyStore);
    await store.ensureLoaded();
    expect(store.vocabulary().status).toBe('error');
    expect(store.lists()).toBeNull();
    await store.ensureLoaded();
    expect(vocabulary).toHaveBeenCalledTimes(2);
  });
});
