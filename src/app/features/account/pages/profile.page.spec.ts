import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore, SessionUser, VerificationStatus } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { Profile, ProfileApi, ProfileFields } from '../data/profile.api';
import { PROFILE, VOCABULARY } from '../data/profile.fixtures';
import { AUTOSAVE_DELAY_MS } from '../data/profile.store';
import { ProfilePage } from './profile.page';

function user(verificationStatus: VerificationStatus): SessionUser {
  return {
    id: '1',
    email: 'claire@example.test',
    displayName: 'Claire Martin',
    profession: 'psychologist',
    verificationStatus,
    role: 'practitioner',
    twoFactorEnabled: false,
    passwordChangeRequired: false,
  };
}

type Api = { [K in keyof ProfileApi]: ReturnType<typeof vi.fn> };

function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    load: vi.fn().mockResolvedValue(PROFILE),
    save: vi.fn(async (body: ProfileFields): Promise<Profile> => ({ ...PROFILE, ...body })),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    vocabulary: vi.fn().mockResolvedValue(VOCABULARY),
    ...overrides,
  };
}

async function render(api: Api, status: VerificationStatus = 'approved') {
  TestBed.configureTestingModule({
    imports: [ProfilePage],
    providers: [
      provideRouter([]),
      { provide: ProfileApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(user(status));
  const fixture = TestBed.createComponent(ProfilePage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<unknown>, ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await fixture.whenStable();
}

function input(el: HTMLElement, id: string): HTMLInputElement {
  const field = el.querySelector<HTMLInputElement>(`#field-${id}`);
  if (!field) throw new Error(`champ absent : ${id}`);
  return field;
}

function typeInto(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

describe('ProfilePage', () => {
  it('chargement : squelette tant que le profil n’est pas arrivé', async () => {
    const api = fakeApi({ load: vi.fn(() => new Promise<Profile>(() => undefined)) });
    const { el } = await render(api);
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('erreur : bloc erreur avec « Réessayer », puis le formulaire', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(PROFILE);
    const { fixture, el } = await render(fakeApi({ load }));
    expect(el.querySelector('pm-state [role="alert"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
    const retry = Array.from(el.querySelectorAll<HTMLButtonElement>('pm-state button')).find((b) =>
      b.textContent?.includes('Réessayer'),
    )!;
    retry.click();
    await settle(fixture);
    expect(el.querySelector('form')).not.toBeNull();
    expect(input(el, 'displayName').value).toBe('Claire Martin');
  });

  it('contenu : formulaire rempli, aperçu et carte de publication', async () => {
    const { el } = await render(fakeApi());
    expect(input(el, 'displayName').value).toBe('Claire Martin');
    expect(el.querySelector('[data-testid="preview"] .name')?.textContent).toBe('Claire Martin');
    expect(el.querySelector('.url')?.textContent).toContain('/praticiens/claire-martin');
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain(
      'Enregistré automatiquement',
    );
  });

  it('modifier le nom : PUT complet après 800 ms, « Enregistré », aperçu mis à jour', async () => {
    const api = fakeApi();
    const { fixture, el } = await render(api);
    typeInto(input(el, 'displayName'), 'Claire Moreau');
    await settle(fixture);
    expect(el.querySelector('[data-testid="preview"] .name')?.textContent).toBe('Claire Moreau');
    expect(api.save).not.toHaveBeenCalled();
    await settle(fixture, AUTOSAVE_DELAY_MS + 50);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0][0]).toMatchObject({
      displayName: 'Claire Moreau',
      specialties: [],
      country: 'FR',
    });
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain('Enregistré');
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain("à l'instant");
  });

  it('nom vidé : rien n’est envoyé, le statut demande de corriger', async () => {
    const api = fakeApi();
    const { fixture, el } = await render(api);
    typeInto(input(el, 'displayName'), '');
    await settle(fixture, AUTOSAVE_DELAY_MS + 50);
    expect(api.save).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain(
      'corrigez les champs signalés',
    );
  });

  it('422 du PUT : le message du serveur sous le champ', async () => {
    const api = fakeApi({
      save: vi.fn().mockRejectedValue({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'city', code: '', message: 'Ville trop longue' }],
      }),
    });
    const { fixture, el } = await render(api);
    typeInto(input(el, 'city'), 'Lyon');
    await settle(fixture, AUTOSAVE_DELAY_MS + 50);
    expect(el.querySelector('#field-city-error')?.textContent).toContain('Ville trop longue');
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain(
      'corrigez les champs signalés',
    );
  });

  it('dossier non approuvé : interrupteur « Publié » inactif avec le motif', async () => {
    const { el } = await render(fakeApi(), 'under_review');
    const toggle = el.querySelector<HTMLInputElement>('pm-publish-card input[role="switch"]')!;
    expect(toggle.disabled).toBe(true);
    expect(el.querySelector('#publish-locked')?.textContent).toContain(
      'Dossier en cours de vérification',
    );
  });

  it('publication refusée (409 missing contact) : ligne à corriger sous l’interrupteur', async () => {
    const api = fakeApi({
      publish: vi.fn().mockRejectedValue({
        status: 409,
        code: 'PROFILE_INCOMPLETE',
        extra: { missing: ['contact'] },
      }),
    });
    const { fixture, el } = await render(api);
    el.querySelector<HTMLInputElement>('pm-publish-card input[role="switch"]')!.click();
    await settle(fixture);
    const refused = el.querySelector('[data-testid="publish-refused"]');
    expect(refused?.textContent).toContain('Affichez au moins un moyen de contact');
    refused!.querySelector<HTMLButtonElement>('button')!.click();
    expect(document.activeElement?.id).toBe('field-contactPhone');
  });

  it('publier avec un formulaire invalide : rien n’est envoyé, focus sur le champ fautif', async () => {
    const api = fakeApi();
    const { fixture, el } = await render(api);
    typeInto(input(el, 'displayName'), '');
    await settle(fixture);
    el.querySelector<HTMLInputElement>('pm-publish-card input[role="switch"]')!.click();
    await settle(fixture);
    expect(api.publish).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('field-displayName');
    expect(el.querySelector('#field-displayName-error')?.textContent).toContain('obligatoire');
  });

  it('422 sur un champ sans contrôle visible (pays) : message dans la ligne d’état', async () => {
    const api = fakeApi({
      save: vi.fn().mockRejectedValue({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'country', code: '', message: 'Pays invalide' }],
      }),
    });
    const { fixture, el } = await render(api);
    typeInto(input(el, 'city'), 'Lyon');
    await settle(fixture, AUTOSAVE_DELAY_MS + 50);
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).toContain('Pays invalide');
    // Le champ caché ne bloque pas les enregistrements suivants.
    typeInto(input(el, 'city'), 'Lyon 6e');
    await settle(fixture);
    expect(el.querySelector('[data-testid="save-status"]')?.textContent).not.toContain(
      'corrigez les champs',
    );
  });

  it('publication acceptée : profil relu, pastille « publié » dans la navigation', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(PROFILE)
      .mockResolvedValue({ ...PROFILE, published: true });
    const { fixture, el } = await render(fakeApi({ load }));
    el.querySelector<HTMLInputElement>('pm-publish-card input[role="switch"]')!.click();
    await settle(fixture);
    expect(
      el.querySelector<HTMLInputElement>('pm-publish-card input[role="switch"]')!.checked,
    ).toBe(true);
    expect(el.querySelector('pm-account-nav .badge.success')?.textContent).toContain('publié');
  });

  it('liste fermée indisponible : erreur dans la section, le reste du formulaire reste utilisable', async () => {
    const { el } = await render(
      fakeApi({ vocabulary: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }) }),
    );
    expect(el.textContent).toContain("Listes de l'annuaire indisponibles");
    expect(el.querySelector('pm-chip-picker')).toBeNull();
    expect(input(el, 'displayName')).toBeTruthy();
  });
});
