import { BreakpointObserver } from '@angular/cdk/layout';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { HttpNotices } from '../../../core/http';
import { DirectoryApi } from '../data/directory.api';
import { CLAIRE_CARD, page, VOCABULARY } from '../data/directory.fixtures';
import { EMPTY_QUERY } from '../data/directory.models';
import { DirectoryPage, FILTER_DEBOUNCE_MS } from './directory.page';

interface Api {
  search: ReturnType<typeof vi.fn>;
  vocabulary: ReturnType<typeof vi.fn>;
}

async function render(url: string, api: Partial<Api> = {}, options: { compact?: boolean } = {}) {
  const mock: Api = {
    search: api.search ?? vi.fn().mockResolvedValue(page([CLAIRE_CARD])),
    vocabulary: api.vocabulary ?? vi.fn().mockResolvedValue(VOCABULARY),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'annuaire', component: DirectoryPage }]),
      { provide: DirectoryApi, useValue: mock },
      // Largeur simulée : sous 760 px, les filtres passent en panneau (fiche 08, UX-D6).
      {
        provide: BreakpointObserver,
        useValue: { observe: () => of({ matches: !!options.compact, breakpoints: {} }) },
      },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await harness.fixture.whenStable();
  await vi.waitFor(() => expect(mock.search).toHaveBeenCalled());
  await harness.fixture.whenStable();
  return { harness, el: harness.routeNativeElement as HTMLElement, api: mock };
}

function never<T>() {
  return new Promise<T>(() => undefined);
}

describe('DirectoryPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove());
  });

  it('lit la recherche dans l’URL, ignore une spécialité hors liste fermée et corrige l’URL', async () => {
    const { api, harness } = await render('/annuaire?ville=Paris&specialite=anxiety,astrologie');
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({
        ...EMPTY_QUERY,
        city: 'Paris',
        specialties: ['anxiety'],
      }),
    );
    expect(TestBed.inject(Router).url).toBe('/annuaire?ville=Paris&specialite=anxiety');
    expect(api.search).not.toHaveBeenCalledWith(
      expect.objectContaining({ specialties: ['anxiety', 'astrologie'] }),
    );
    await harness.fixture.whenStable();
  });

  it('chargement : trois fiches squelette, aria-busy', async () => {
    const { el } = await render('/annuaire', { search: vi.fn().mockReturnValue(never()) });
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.cards')).toBeNull();
  });

  it('résultats : landmarks, compte en aria-live, fiches, note des praticiens vérifiés', async () => {
    const { el } = await render('/annuaire?ville=Paris');
    expect(el.querySelector('form[role="search"]')).not.toBeNull();
    expect(el.querySelector('aside')?.getAttribute('aria-label')).toBe('Filtres');
    expect(el.querySelector('.count[aria-live="polite"]')?.textContent).toContain(
      '1 praticien à Paris',
    );
    expect(el.querySelectorAll('pm-practitioner-card')).toHaveLength(1);
    expect(el.textContent).toContain('Seuls les praticiens dont le dossier a été vérifié');
    expect(el.textContent).not.toMatch(/3114|\b15\b/);
    const robots = TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]');
    expect(robots?.getAttribute('content')).toBe('index,follow');
    expect(
      TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe(`${TestBed.inject(DOCUMENT).location.origin}/fr/annuaire`);
  });

  it('facettes : les compteurs suivent chaque réponse', async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce(page([CLAIRE_CARD]))
      .mockResolvedValueOnce(
        page([CLAIRE_CARD, { ...CLAIRE_CARD, slug: 'b' }], {
          facets: {
            professions: [{ code: 'psychologist', count: 7 }],
            specialties: [],
            modalities: [],
            audiences: [],
            languages: [],
          },
        }),
      );
    const { el, harness } = await render('/annuaire', { search });
    const psychologist = () =>
      [...el.querySelectorAll('aside label.option')].find((b) =>
        b.textContent?.includes('Psychologue'),
      );
    expect(psychologist()?.textContent).toContain('1');
    await harness.navigateByUrl('/annuaire?ville=Lyon');
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    await harness.fixture.whenStable();
    expect(psychologist()?.textContent).toContain('7');
  });

  it('filtre : visible tout de suite, URL et requête après 300 ms, retour en page 1', async () => {
    const { el, api, harness } = await render('/annuaire?page=2');
    vi.useFakeTimers();
    const box = [...el.querySelectorAll('aside label.option')]
      .find((b) => b.textContent?.includes('Psychologue'))
      ?.querySelector('input') as HTMLInputElement;
    box.click();
    harness.detectChanges();
    expect(box.checked).toBe(true);
    expect(api.search).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS + 10);
    vi.useRealTimers();
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({
        ...EMPTY_QUERY,
        professions: ['psychologist'],
      }),
    );
    expect(TestBed.inject(Router).url).toBe('/annuaire?profession=psychologist');
  });

  it('aucun résultat : critères retirables, trois suggestions, lien Comment ça marche', async () => {
    const { el, api, harness } = await render(
      '/annuaire?ville=Brest&profession=coach&modalite=home',
      {
        search: vi.fn().mockResolvedValue(page([])),
      },
    );
    const empty = el.querySelector('.no-results');
    expect(empty?.textContent).toContain('Aucun praticien à Brest pour ces critères');
    const chips = [...el.querySelectorAll('.chips button')].map((b) => b.textContent?.trim());
    expect(chips.map((c) => c?.split('retirer')[0].trim())).toEqual([
      'Brest',
      'Coach',
      'À domicile',
    ]);
    const suggestions = [...el.querySelectorAll('.suggestions button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(suggestions).toEqual([
      'Élargir à toute la France',
      'Retirer « À domicile »',
      'Inclure la visio',
    ]);
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/comment-ca-marche');

    // Une puce retirée : ce critère seul disparaît.
    (el.querySelectorAll('.chips button')[1] as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({
        ...EMPTY_QUERY,
        city: 'Brest',
        modalities: ['home'],
      }),
    );
    await harness.fixture.whenStable();
  });

  it('erreur : message de l’annuaire indisponible, Réessayer relance, saisie conservée', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(page([CLAIRE_CARD]));
    const { el, harness } = await render('/annuaire?q=anxi%C3%A9t%C3%A9', { search });
    const alert = el.querySelector('pm-state [role="alert"]');
    expect(alert?.textContent).toContain("L'annuaire est momentanément indisponible");
    expect((el.querySelector('#directory-q') as HTMLInputElement).value).toBe('anxiété');
    [...el.querySelectorAll('pm-state button')]
      .find((b) => b.textContent?.includes('Réessayer'))
      ?.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    await harness.fixture.whenStable();
    expect(el.querySelectorAll('pm-practitioner-card')).toHaveLength(1);
  });

  it('429 : « réessayez dans n s », Rechercher désactivé, saisie conservée, aucune requête', async () => {
    const search = vi.fn().mockResolvedValue(page([CLAIRE_CARD]));
    const { el, harness } = await render('/annuaire', { search });
    TestBed.inject(HttpNotices).rateLimited(30, true);
    await harness.fixture.whenStable();
    expect(el.querySelector('.rate-limited')?.textContent).toMatch(/réessayez dans 30 s/);
    const submit = el.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(true);
    const city = el.querySelector<HTMLInputElement>('#directory-city');
    city!.value = 'Nantes';
    city!.dispatchEvent(new Event('input'));
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    expect(search).toHaveBeenCalledTimes(1);
    expect(city?.value).toBe('Nantes');
  });

  it('Rechercher : mot-clé et ville dans l’URL, page 1', async () => {
    const { el, api, harness } = await render('/annuaire?page=3');
    const q = el.querySelector<HTMLInputElement>('#directory-q')!;
    q.value = 'deuil';
    q.dispatchEvent(new Event('input'));
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({ ...EMPTY_QUERY, q: 'deuil' }),
    );
    expect(TestBed.inject(Router).url).toBe('/annuaire?q=deuil');
    await harness.fixture.whenStable();
  });

  it('« Tout effacer » en tête de colonne : filtres retirés, mot-clé et ville gardés', async () => {
    const { el, api, harness } = await render('/annuaire?ville=Paris&profession=coach&accepte=oui');
    const clear = [...el.querySelectorAll<HTMLButtonElement>('aside button')].find((b) =>
      b.textContent?.includes('Tout effacer'),
    )!;
    clear.click();
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({ ...EMPTY_QUERY, city: 'Paris' }),
    );
    await harness.fixture.whenStable();
  });

  it('un filtre appliqué pendant la saisie de la ville ne l’efface pas', async () => {
    const { el, harness } = await render('/annuaire');
    const city = el.querySelector<HTMLInputElement>('#directory-city')!;
    city.value = 'Lyon';
    city.dispatchEvent(new Event('input'));
    await harness.navigateByUrl('/annuaire?profession=coach');
    await harness.fixture.whenStable();
    expect(city.value).toBe('Lyon');
    await harness.navigateByUrl('/annuaire?ville=Nantes');
    await harness.fixture.whenStable();
    expect(city.value).toBe('Nantes');
  });

  it('nombre de résultats : nombre en gras, ville en texte secondaire', async () => {
    const { el } = await render('/annuaire?ville=Paris');
    const count = el.querySelector('.results-head .count')!;
    expect(count.querySelector('strong')?.textContent?.trim()).toBe('1 praticien');
    expect(count.querySelector('.where')?.textContent?.trim()).toBe('à Paris');
  });

  it('grand écran : colonne de filtres en place, ni dialogue ni bouton de fermeture', async () => {
    const { el } = await render('/annuaire');
    const panel = el.querySelector('.filters-panel')!;
    expect(panel.getAttribute('role')).toBeNull();
    expect(el.querySelector('.panel-close')).toBeNull();
  });

  it('petit écran : « Filtres (n) » ouvre un dialogue modal ; Échap le ferme et rend le focus', async () => {
    const { el, harness } = await render(
      '/annuaire?profession=psychologist',
      {},
      {
        compact: true,
      },
    );
    const toggle = el.querySelector<HTMLButtonElement>('.filters-toggle')!;
    // jsdom ignore les media queries : le bouton, affiché sous 760 px, est rendu visible à la main.
    toggle.style.display = 'inline-flex';
    expect(toggle.textContent?.trim()).toBe('Filtres (1)');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await harness.fixture.whenStable();
    const panel = el.querySelector<HTMLElement>('.filters-panel')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe('directory-filters-title');
    expect(el.querySelector('#directory-filters-title')?.textContent?.trim()).toBe('Filtres');
    await vi.waitFor(() => expect(document.activeElement).toBe(panel));
    expect(el.querySelector('.panel-close')?.getAttribute('aria-label')).toBe('Fermer les filtres');
    expect(el.querySelector('.panel-foot button')?.textContent?.trim()).toBe('Voir 1 praticien');

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await harness.fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.getAttribute('role')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(toggle));

    // « Voir 1 praticien » ferme aussi le panneau.
    toggle.click();
    await harness.fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.panel-foot button')!.click();
    await harness.fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
