import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { DirectoryApi } from '../data/directory.api';
import { CLAIRE_PROFILE, VOCABULARY } from '../data/directory.fixtures';
import { PractitionerProfile } from '../data/directory.models';
import { PractitionerPage } from './practitioner.page';

async function render(api: Partial<Record<keyof DirectoryApi, ReturnType<typeof vi.fn>>>) {
  const mock = {
    profile: vi.fn().mockResolvedValue(CLAIRE_PROFILE),
    vocabulary: vi.fn().mockResolvedValue(VOCABULARY),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [{ path: 'praticiens/:slug', component: PractitionerPage }],
        withComponentInputBinding(),
      ),
      { provide: DirectoryApi, useValue: mock },
    ],
  });
  const harness = await RouterTestingHarness.create('/praticiens/claire-moreau');
  await harness.fixture.whenStable();
  await harness.fixture.whenStable();
  return { harness, el: harness.routeNativeElement as HTMLElement, api: mock };
}

const head = () => TestBed.inject(DOCUMENT).head;

describe('PractitionerPage', () => {
  afterEach(() =>
    head()
      .querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove()),
  );

  it('chargement : squelette de fiche', async () => {
    const { el } = await render({ profile: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
  });

  it('fiche : identité, fil d’Ariane, présentation, pratique, contacts affichés seulement, cabinet', async () => {
    const { el, api } = await render({});
    expect(api.profile).toHaveBeenCalledWith('claire-moreau');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Claire Moreau');
    expect(el.textContent).toContain('Profil vérifié');
    expect(el.querySelector('.profession-row')?.textContent).toContain('Psychologue');
    expect(el.querySelector('.profession-row')?.textContent).toContain('69 93 1234 5');
    const crumbs = [...el.querySelectorAll('.crumbs a')].map((a) => a.getAttribute('href'));
    expect(crumbs).toEqual([
      '/annuaire',
      '/annuaire?profession=psychologist',
      '/annuaire?ville=Lyon&profession=psychologist',
    ]);
    expect(
      el.querySelector('#practitioner-bio')?.parentElement?.querySelector('strong')?.textContent,
    ).toBe('adultes');
    expect(el.querySelectorAll('.practice .tags')[0].textContent).toContain('Anxiété');
    const modalities = [...el.querySelectorAll('.modalities li')].map((li) =>
      li.textContent?.trim(),
    );
    expect(modalities).toEqual(['Au cabinet', 'En visio', 'À domicile · non proposé']);
    expect(el.textContent).toContain('Séance 50 min : 70 €');

    // E-mail masqué (null) : ni libellé ni lien ; téléphone et site affichés.
    const means = el.querySelector('.means')?.textContent ?? '';
    expect(means).toContain('Téléphone');
    expect(means).toContain('Site web');
    expect(means).not.toContain('E-mail');
    expect(el.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(el.querySelector('address')?.textContent).toContain('12 rue Vendôme');
    expect(el.querySelector('a.map')?.getAttribute('href')).toContain('openstreetmap.org');
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).not.toMatch(/3114|signaler/i);

    // Balises : titre de la fiche, indexable, JSON-LD Person.
    expect(TestBed.inject(DOCUMENT).title).toBe('Claire Moreau · Psychologue · Lyon · PsyMate');
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index,follow',
    );
    const jsonLd = JSON.parse(
      head().querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    );
    expect(jsonLd).toMatchObject({
      '@type': 'Person',
      name: 'Claire Moreau',
      jobTitle: 'Psychologue',
    });
  });

  it('sections vides non rendues ; « Coach » pour profession = coach', async () => {
    const bare: PractitionerProfile = {
      ...CLAIRE_PROFILE,
      profession: 'coach',
      professionalNumber: null,
      bio: null,
      specialties: [],
      audiences: [],
      modalities: [],
      languages: [],
      fees: null,
      phone: null,
      websiteUrl: null,
      address: null,
      verified: false,
    };
    const { el } = await render({ profile: vi.fn().mockResolvedValue(bare) });
    expect(el.querySelector('.profession-row')?.textContent).toContain('Coach');
    expect(el.querySelector('#practitioner-bio')).toBeNull();
    expect(el.querySelector('.practice')).toBeNull();
    expect(el.querySelector('.means')).toBeNull();
    expect(el.querySelector('address')).toBeNull();
    expect(el.querySelector('pm-verified-badge')).toBeNull();
    expect(el.querySelector('#contact form')).not.toBeNull();
  });

  it('404 : fiche introuvable, non indexée, lien vers l’annuaire', async () => {
    const { el } = await render({
      profile: vi.fn().mockRejectedValue({ status: 404, code: 'PROFILE_NOT_FOUND' }),
    });
    expect(el.querySelector('h1')?.textContent).toContain('Fiche introuvable');
    expect(el.querySelector('.not-found a')?.getAttribute('href')).toBe('/annuaire');
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,follow',
    );
  });

  it('erreur serveur : état erreur avec Réessayer', async () => {
    const profile = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(CLAIRE_PROFILE);
    const { el, harness } = await render({ profile });
    expect(el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      "Impossible d'afficher cette fiche",
    );
    [...el.querySelectorAll('pm-state button')]
      .find((b) => b.textContent?.includes('Réessayer'))
      ?.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(profile).toHaveBeenCalledTimes(2));
    await harness.fixture.whenStable();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Claire Moreau');
  });
});
