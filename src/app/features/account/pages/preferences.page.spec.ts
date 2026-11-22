import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PreferencesApi } from '../../../core/preferences/data/preferences.api';
import { LocaleNavigator } from '../../../core/preferences/locale-navigator';
import { defaultPreferences, Preferences } from '../../../core/preferences/preferences.model';
import { PreferencesStore } from '../../../core/preferences';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
import { ProfileApi } from '../data/profile.api';
import { PROFILE } from '../data/profile.fixtures';
import { SecurityApi } from '../data/security.api';
import { manySessions, OVERVIEW } from '../data/security.fixtures';
import { PreferencesPage } from './preferences.page';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

interface Api {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
}

function serverFor(initial: Preferences): Api {
  let state = { ...initial };
  return {
    get: vi.fn(async () => ({ ...state })),
    patch: vi.fn(async (changes: Partial<Preferences>) => {
      state = { ...state, ...changes };
      return { ...state };
    }),
  };
}

function securityApi(overrides: Partial<Record<keyof SecurityApi, unknown>> = {}) {
  return {
    loadSecurity: vi.fn().mockResolvedValue(OVERVIEW),
    revokeOtherSessions: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

/** GET /api/me/profile simulé : seuls `published` et `slug` servent à la page. */
function profileApi(published: boolean) {
  return { load: vi.fn().mockResolvedValue({ ...PROFILE, published }) };
}

async function render(
  api: Api,
  user: SessionUser = claire,
  security = securityApi(),
  confirm = vi.fn().mockResolvedValue(true),
  profile: { load: ReturnType<typeof vi.fn> } = profileApi(true),
) {
  TestBed.configureTestingModule({
    imports: [PreferencesPage],
    providers: [
      provideRouter([]),
      { provide: PreferencesApi, useValue: api },
      { provide: ProfileApi, useValue: profile },
      { provide: SessionApi, useValue: {} },
      { provide: LocaleNavigator, useValue: { current: 'fr', goTo: vi.fn() } },
      { provide: SecurityApi, useValue: security },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ],
  });
  TestBed.inject(SessionStore).signIn(user);
  const fixture = TestBed.createComponent(PreferencesPage);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    toasts: TestBed.inject(ToastService),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

function pressed(el: HTMLElement, group: string): string[] {
  return Array.from(
    el.querySelectorAll<HTMLButtonElement>(
      `[aria-labelledby="${group}-label"] button[aria-pressed="true"]`,
    ),
  ).map((button) => button.textContent?.trim() ?? '');
}

function buttonNamed(el: HTMLElement, group: string, text: string): HTMLButtonElement {
  const button = Array.from(
    el.querySelectorAll<HTMLButtonElement>(`[aria-labelledby="${group}-label"] button`),
  ).find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`bouton absent : ${group} / ${text}`);
  return button;
}

describe('PreferencesPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    TestBed.inject(ToastService).clear();
  });

  it('chargement : squelette, aucune section', async () => {
    const api: Api = { get: vi.fn(() => new Promise(() => undefined)), patch: vi.fn() };
    const { el } = await render(api);
    expect(el.querySelector('pm-state .loading[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('section.card')).toBeNull();
    expect(el.querySelector('pm-account-nav .name')?.textContent).toBe('Claire Martin');
  });

  it('erreur : bloc erreur avec Réessayer, puis contenu après un nouvel essai', async () => {
    const api: Api = {
      get: vi
        .fn()
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValue(defaultPreferences('psychologist')),
      patch: vi.fn(),
    };
    const { fixture, el } = await render(api);
    expect(el.querySelector('pm-state .error[role="alert"]')?.textContent).toContain(
      'Impossible de charger vos préférences',
    );
    expect(el.querySelector('section.card')).toBeNull();

    const retry = el.querySelector<HTMLButtonElement>('pm-state button.retry');
    expect(retry?.textContent?.trim()).toBe('Réessayer');
    retry?.click();
    await settle(fixture);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-state .error')).toBeNull();
    expect(el.querySelectorAll('section.card')).toHaveLength(5);
  });

  it('chargé : cinq sections, valeurs serveur reflétées, résumé sécurité', async () => {
    const api = serverFor({
      ...defaultPreferences('psychologist'),
      'overview.window': '12m',
      theme: 'soft',
      'sessions.defaultDurationMin': 45,
    });
    const { el } = await render(api, { ...claire, twoFactorEnabled: true });
    expect(el.querySelector('h1')?.textContent).toBe('Préférences');
    expect(el.querySelectorAll('section.card')).toHaveLength(5);
    expect(pressed(el, 'overview-window')).toEqual(['1 an']);
    // UX-S6 : plus de réglage « Vue d'ensemble par défaut » (Simple / Complète), une seule vue.
    expect(el.querySelector('#overview-view-label')).toBeNull();
    expect(el.textContent).not.toContain("Vue d'ensemble par défaut");
    expect(el.querySelector<HTMLInputElement>('input[type=radio][value=soft]')?.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input.number')?.value).toBe('45');
    expect(el.querySelector('.summary')?.textContent).toContain('claire@example.test');
    expect(el.querySelector('.summary dd.success')?.textContent?.trim()).toBe('Activée');
    expect(el.querySelector('a[href="/mon-compte/emotions"]')).not.toBeNull();
    expect(el.querySelector('a[href="/mon-compte/securite"]')).not.toBeNull();
  });

  it('un réglage change : aria-pressed tout de suite, PATCH de la seule clé, « Enregistré »', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    const { fixture, el } = await render(api);
    buttonNamed(el, 'overview-window', '30 j').click();
    await fixture.whenStable();
    expect(pressed(el, 'overview-window')).toEqual(['30 j']);
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'overview.window': '30d' }, expect.anything());
    expect(el.querySelector('.saved')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      "Enregistré · à l'instant",
    );
  });

  it('UX-C3 : indicateur sous le titre, « Enregistré automatiquement » avant tout changement', async () => {
    const { el } = await render(serverFor(defaultPreferences('psychologist')));
    const saved = el.querySelector('header .saved');
    expect(saved?.textContent?.trim()).toBe('Enregistré automatiquement');
    expect(saved?.querySelector('[role="status"]')).not.toBeNull();
  });

  it('UX-C3 : résumé sécurité en trois tuiles, appareils distincts et connexion précédente', async () => {
    const { el } = await render(
      serverFor(defaultPreferences('psychologist')),
      claire,
      securityApi({
        loadSecurity: vi.fn().mockResolvedValue(manySessions(10)),
      }),
    );
    const tiles = el.querySelectorAll('.summary .tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[1].querySelector('a')?.getAttribute('href')).toBe('/mon-compte/securite/2fa');
    expect(tiles[2].textContent?.replace(/\s+/g, ' ')).toContain('Sessions actives');
    expect(tiles[2].querySelector('dd.value')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '4 appareils',
    );
    expect(el.querySelector('.last-login')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Connexion précédente :',
    );
    expect(el.querySelector('.last-login')?.textContent).toContain('Chrome · Windows');
  });

  it('UX-C3 : « Déconnecter les autres » confirme, appelle le serveur et annonce le nombre', async () => {
    const security = securityApi();
    const confirm = vi.fn().mockResolvedValue(true);
    const { fixture, el } = await render(
      serverFor(defaultPreferences('psychologist')),
      claire,
      security,
      confirm,
    );
    el.querySelector<HTMLButtonElement>('.summary .tile button.link')!.click();
    await settle(fixture);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(security.revokeOtherSessions).toHaveBeenCalledTimes(1);
    // La liste est relue après l'écriture, jamais recalculée localement.
    expect(security.loadSecurity).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '1 appareil déconnecté.',
    );
  });

  it('UX-C3 : sessions indisponibles → tuile en erreur avec Réessayer, le reste reste lisible', async () => {
    const loadSecurity = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(OVERVIEW);
    const { fixture, el } = await render(
      serverFor(defaultPreferences('psychologist')),
      claire,
      securityApi({ loadSecurity }),
    );
    const tile = el.querySelectorAll('.summary .tile')[2];
    expect(tile.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger vos sessions',
    );
    expect(el.querySelector('.summary')?.textContent).toContain('claire@example.test');
    tile.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await settle(fixture);
    expect(tile.querySelector('dd.value')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2 appareils',
    );
  });

  it('thème : data-theme change sans rechargement', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    const { fixture, el } = await render(api);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    const dark = el.querySelector<HTMLInputElement>('input[type=radio][value=dark]');
    dark?.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ theme: 'dark' }, expect.anything());
  });

  it('PATCH en erreur : valeur serveur rétablie et toast d’avertissement', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    api.patch.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const { fixture, el, toasts } = await render(api);
    buttonNamed(el, 'visibility', 'Privée').click();
    await settle(fixture);
    expect(pressed(el, 'visibility')).toEqual(['Clinique']);
    expect(toasts.toasts()).toHaveLength(1);
    expect(toasts.toasts()[0].level).toBe('warning');
    expect(toasts.toasts()[0].message).toContain(
      'Impossible d’enregistrer ce réglage'.replace('’', "'"),
    );
  });

  it('422 sur la durée : message du serveur dans le toast, champ rétabli', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    api.patch.mockRejectedValueOnce({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'sessions.defaultDurationMin',
          code: 'INVALID_VALUE',
          message: 'Un entier entre 15 et 180 est attendu.',
        },
      ],
    });
    const { fixture, el, toasts } = await render(api);
    const input = el.querySelector<HTMLInputElement>('input.number');
    if (!input) throw new Error('champ durée absent');
    input.value = '999';
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith(
      { 'sessions.defaultDurationMin': 999 },
      expect.anything(),
    );
    expect(input.value).toBe('60');
    expect(toasts.toasts()[0].message).toBe(
      'Réglage non enregistré : Un entier entre 15 et 180 est attendu.',
    );
  });

  it('durée non entière : rien n’est envoyé, le champ revient à la valeur courante', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    const { fixture, el, toasts } = await render(api);
    const input = el.querySelector<HTMLInputElement>('input.number');
    if (!input) throw new Error('champ durée absent');
    input.value = '12.5';
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(api.patch).not.toHaveBeenCalled();
    expect(input.value).toBe('60');
    expect(toasts.toasts()[0].message).toBe('Saisissez un nombre entier de minutes.');
  });

  it('coach : « Client·e » actif sans action, type médicament masqué, aide au pluriel « clients »', async () => {
    const api = serverFor(defaultPreferences('coach'));
    const { el } = await render(api, {
      ...claire,
      profession: 'coach',
      displayName: 'Samir Benali',
    });
    expect(pressed(el, 'subject')).toEqual(['Client·e']);
    expect(el.querySelector('#subject-help')?.textContent).toContain('« clients »');
    expect(
      el.querySelector<HTMLInputElement>('mat-slide-toggle button')?.getAttribute('aria-checked'),
    ).toBe('false');
    expect(el.querySelector('pm-account-nav .subtitle')?.textContent).toBe('Coach');
  });

  it('accessibilité des lignes : libellé et aide reliés au contrôle', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    const { el } = await render(api);
    const group = el.querySelector('[role=group][aria-labelledby="overview-window-label"]');
    expect(group?.getAttribute('aria-describedby')).toBe('overview-window-help');
    expect(el.querySelector('#overview-window-label')?.textContent).toBe("Fenêtre d'analyse");
    expect(el.querySelector('[role=radiogroup][aria-labelledby="theme-label"]')).not.toBeNull();
    expect(el.querySelectorAll('input[type=radio][name=theme]')).toHaveLength(4);
    expect(el.querySelector('select[aria-labelledby="locale-label"]')).not.toBeNull();
  });
});

// Prise de rendez-vous en ligne (M14-11, fiche 14, section du même nom).
describe('PreferencesPage · Prise de rendez-vous en ligne', () => {
  const MONDAY = { day: 1, start: '09:00', end: '12:00' } as const;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    TestBed.inject(ToastService).clear();
    document.body.replaceChildren();
  });

  function section(el: HTMLElement): HTMLElement {
    const found = el.querySelector<HTMLElement>('section[aria-labelledby="h-booking"]');
    if (!found) throw new Error('section Prise de rendez-vous absente');
    return found;
  }

  function status(el: HTMLElement): string | null {
    return section(el).querySelector('.section-status')?.textContent?.trim() ?? null;
  }

  function pageLink(el: HTMLElement): HTMLAnchorElement | null {
    return (
      Array.from(section(el).querySelectorAll<HTMLAnchorElement>('a')).find((a) =>
        a.textContent?.includes('Voir ma page de rendez-vous'),
      ) ?? null
    );
  }

  function numberInput(el: HTMLElement, id: string): HTMLInputElement {
    const input = section(el).querySelector<HTMLInputElement>(
      `input[aria-labelledby="${id}-label"]`,
    );
    if (!input) throw new Error(`champ absent : ${id}`);
    return input;
  }

  async function change(
    fixture: ComponentFixture<unknown>,
    input: HTMLInputElement,
    value: string,
  ): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await settle(fixture);
  }

  function withBooking(changes: Partial<Preferences>): Api {
    return serverFor({ ...defaultPreferences('psychologist'), ...changes });
  }

  it('place et ordre : entre « Vocabulaire et saisie » et « Émotions personnalisées »', async () => {
    const { el } = await render(withBooking({}));
    const titles = Array.from(el.querySelectorAll('section.card h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(titles).toEqual([
      'Affichage',
      'Vocabulaire et saisie',
      'Prise de rendez-vous en ligne',
      'Émotions personnalisées',
      'Compte et sécurité',
    ]);
  });

  it('désactivée (défauts) : phrase d’état, réglages visibles et valeurs par défaut, ni lien ni bandeau', async () => {
    const { el } = await render(withBooking({}));
    expect(status(el)).toBe(
      "Désactivée : votre fiche publique n'a pas de bouton « Prendre rendez-vous ».",
    );
    expect(pageLink(el)).toBeNull();
    expect(section(el).querySelector('.bar')).toBeNull();
    const toggle = section(el).querySelector('mat-slide-toggle button');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(section(el).querySelector('mat-slide-toggle')?.textContent).toContain(
      'Proposer la prise de rendez-vous en ligne',
    );
    expect(
      section(el).querySelector<HTMLInputElement>('input[name=booking-mode][value=manual]')
        ?.checked,
    ).toBe(true);
    expect(numberInput(el, 'booking-duration').value).toBe('60');
    expect(numberInput(el, 'booking-notice').value).toBe('24');
    expect(numberInput(el, 'booking-horizon').value).toBe('28');
    const checks = Array.from(
      section(el).querySelectorAll<HTMLInputElement>('.checks input[type=checkbox]'),
    ).map((box) => [box.parentElement?.textContent?.trim(), box.checked]);
    expect(checks).toEqual([
      ['Au cabinet', true],
      ['En visio', false],
      ['Par téléphone', false],
    ]);
    expect(
      section(el).querySelector<HTMLSelectElement>(
        'select[aria-labelledby="booking-timezone-label"]',
      )?.value,
    ).toBe('Europe/Paris');
    expect(
      section(el).querySelectorAll('pm-booking-windows-editor .wd-day[role=group]'),
    ).toHaveLength(7);
  });

  it('offerte (activée, plages, publié, approuvé) : « Proposée… » et lien vers la page de rendez-vous', async () => {
    const { el } = await render(
      withBooking({ 'booking.enabled': true, 'booking.windows': [MONDAY] }),
    );
    expect(status(el)).toBe('Proposée sur votre fiche publique.');
    const link = pageLink(el);
    expect(link?.getAttribute('href')).toMatch(/\/praticiens\/claire-martin\/rendez-vous$/);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toContain('(nouvel onglet)');
    expect(section(el).querySelector('.bar')).toBeNull();
  });

  it('praticien non approuvé (session simulée) : ni « Proposée… » ni lien, aucune ligne d’état', async () => {
    const { el } = await render(
      withBooking({ 'booking.enabled': true, 'booking.windows': [MONDAY] }),
      { ...claire, verificationStatus: 'under_review' },
    );
    expect(status(el)).toBeNull();
    expect(pageLink(el)).toBeNull();
    expect(el.textContent).not.toContain('Proposée sur votre fiche publique.');
  });

  it('profil non publié : bandeau et lien « Mon profil public », interrupteur utilisable', async () => {
    const api = withBooking({ 'booking.windows': [MONDAY] });
    const { fixture, el } = await render(
      api,
      claire,
      securityApi(),
      vi.fn().mockResolvedValue(true),
      profileApi(false),
    );
    const bar = section(el).querySelector('.bar[role=note]');
    expect(bar?.textContent).toContain(
      "Votre profil public n'est pas publié : la prise de rendez-vous ne sera proposée qu'une fois le profil publié.",
    );
    expect(bar?.querySelector('a')?.getAttribute('href')).toBe('/mon-compte/profil-public');
    expect(bar?.querySelector('a')?.textContent?.trim()).toBe('Mon profil public');

    section(el).querySelector<HTMLButtonElement>('mat-slide-toggle button')?.click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.enabled': true }, expect.anything());
    // Activée, avec des plages, profil non publié : le bandeau remplace la ligne d'état.
    expect(status(el)).toBeNull();
    expect(pageLink(el)).toBeNull();
  });

  it('activée sans plage : phrase d’état, invitation sous l’éditeur, fuseau du navigateur proposé', async () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const other = browser === 'Pacific/Fiji' ? 'Europe/Paris' : 'Pacific/Fiji';
    const api = withBooking({ 'booking.enabled': true, 'booking.timezone': other });
    const { fixture, el } = await render(api);
    expect(status(el)).toBe(
      "La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.",
    );
    expect(section(el).querySelector('.row-full .bar')?.textContent?.trim()).toBe(
      'Ajoutez au moins une plage pour que la prise de rendez-vous soit proposée.',
    );
    expect(section(el).textContent).toContain(`Votre navigateur est réglé sur ${browser}.`);
    // Rien n'est enregistré sans le geste.
    expect(api.patch).not.toHaveBeenCalled();
    buttonIn(section(el), 'Utiliser ce fuseau').click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.timezone': browser }, expect.anything());
    expect(section(el).textContent).not.toContain('Votre navigateur est réglé sur');
  });

  it('mode automatique : PATCH de booking.confirmation seul', async () => {
    const api = withBooking({});
    const { fixture, el } = await render(api);
    const auto = section(el).querySelector<HTMLInputElement>(
      'input[name=booking-mode][value=auto]',
    );
    expect(auto?.getAttribute('aria-describedby')).toBe('booking-mode-auto');
    auto?.click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.confirmation': 'auto' }, expect.anything());
    expect(auto?.checked).toBe(true);
  });

  it('plages : rien ne part avant « Enregistrer les plages », puis PATCH de la liste et relecture', async () => {
    const api = withBooking({ 'booking.enabled': true });
    const { fixture, el } = await render(api);
    const monday = section(el).querySelector<HTMLElement>('[aria-label="Plages du lundi"]');
    if (!monday) throw new Error('lundi absent');
    buttonIn(monday, 'Ajouter une plage').click();
    await settle(fixture);
    const [start, end] = Array.from(monday.querySelectorAll<HTMLInputElement>('input.time'));
    for (const [input, value] of [
      [start, '09:00'],
      [end, '12:00'],
    ] as const) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await settle(fixture);
    expect(api.patch).not.toHaveBeenCalled();
    buttonIn(section(el), 'Enregistrer les plages').click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.windows': [MONDAY] }, expect.anything());
    expect(status(el)).toBe('Proposée sur votre fiche publique.');
    expect(section(el).querySelector('.saved-flag')?.textContent?.trim()).toBe('Enregistré');
  });

  it('retirer la dernière plage et enregistrer : « pas proposée… », le lien disparaît', async () => {
    const api = withBooking({ 'booking.enabled': true, 'booking.windows': [MONDAY] });
    const { fixture, el } = await render(api);
    expect(pageLink(el)).not.toBeNull();
    section(el)
      .querySelector<HTMLButtonElement>('[aria-label="Retirer la plage du lundi, 09:00 à 12:00"]')
      ?.click();
    await settle(fixture);
    buttonIn(section(el), 'Enregistrer les plages').click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.windows': [] }, expect.anything());
    expect(status(el)).toBe(
      "La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.",
    );
    expect(pageLink(el)).toBeNull();
  });

  it('422 sur booking.windows : message du serveur sous l’éditeur, préférences relues', async () => {
    const api = withBooking({ 'booking.enabled': true });
    api.patch.mockRejectedValueOnce({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'booking.windows',
          code: 'INVALID_VALUE',
          message: 'Plages invalides : deux plages du même jour se chevauchent.',
        },
      ],
    });
    const { fixture, el, toasts } = await render(api);
    const monday = section(el).querySelector<HTMLElement>('[aria-label="Plages du lundi"]');
    if (!monday) throw new Error('lundi absent');
    buttonIn(monday, 'Ajouter une plage').click();
    await settle(fixture);
    const [start, end] = Array.from(monday.querySelectorAll<HTMLInputElement>('input.time'));
    start.value = '09:00';
    start.dispatchEvent(new Event('input'));
    end.value = '12:00';
    end.dispatchEvent(new Event('input'));
    await settle(fixture);
    const gets = api.get.mock.calls.length;
    buttonIn(section(el), 'Enregistrer les plages').click();
    await settle(fixture);
    expect(
      section(el).querySelector('pm-booking-windows-editor .error.server')?.textContent?.trim(),
    ).toBe('Plages invalides : deux plages du même jour se chevauchent.');
    expect(api.get.mock.calls.length).toBe(gets + 1);
    expect(toasts.toasts()).toHaveLength(0);
    // Le brouillon reste à l'écran ; le serveur, lui, n'a pas de plage.
    expect(start.value).toBe('09:00');
    expect(status(el)).toBe(
      "La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.",
    );
  });

  it('422 sur booking.slotDurationMin : message sous ce réglage, valeur du serveur rétablie', async () => {
    const api = withBooking({});
    api.patch.mockRejectedValueOnce({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'booking.slotDurationMin',
          code: 'OUT_OF_RANGE',
          message: 'Une durée entre 15 et 180 minutes est attendue.',
        },
      ],
    });
    const { fixture, el } = await render(api);
    const duration = numberInput(el, 'booking-duration');
    await change(fixture, duration, '90');
    expect(api.patch).toHaveBeenCalledWith({ 'booking.slotDurationMin': 90 }, expect.anything());
    const error = section(el).querySelector('#booking-duration-error');
    expect(error?.textContent?.trim()).toBe('Une durée entre 15 et 180 minutes est attendue.');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(duration.getAttribute('aria-describedby')).toBe(
      'booking-duration-help booking-duration-error',
    );
    expect(duration.value).toBe('60');
  });

  it('bornes : durée 10, délai 0, horizon 91 refusés sans requête, message sous chaque réglage', async () => {
    const api = withBooking({});
    const { fixture, el } = await render(api);
    await change(fixture, numberInput(el, 'booking-duration'), '10');
    await change(fixture, numberInput(el, 'booking-notice'), '0');
    await change(fixture, numberInput(el, 'booking-horizon'), '91');
    expect(api.patch).not.toHaveBeenCalled();
    expect(section(el).querySelector('#booking-duration-error')?.textContent?.trim()).toBe(
      'Entre 15 et 180, par pas de 5.',
    );
    expect(section(el).querySelector('#booking-notice-error')?.textContent?.trim()).toBe(
      'Entre 1 et 168.',
    );
    expect(section(el).querySelector('#booking-horizon-error')?.textContent?.trim()).toBe(
      'Entre 7 et 90.',
    );
    expect(numberInput(el, 'booking-horizon').value).toBe('91');
    expect(numberInput(el, 'booking-horizon').getAttribute('aria-invalid')).toBe('true');
    // Pas de 5 : 62 est refusé aussi ; une valeur correcte part et efface le message.
    await change(fixture, numberInput(el, 'booking-duration'), '62');
    expect(api.patch).not.toHaveBeenCalled();
    await change(fixture, numberInput(el, 'booking-duration'), '45');
    expect(api.patch).toHaveBeenCalledWith({ 'booking.slotDurationMin': 45 }, expect.anything());
    expect(section(el).querySelector('#booking-duration-error')).toBeNull();
  });

  it('modalités : décocher la dernière n’envoie rien et affiche le message ; en cocher une l’envoie', async () => {
    const api = withBooking({});
    const { fixture, el } = await render(api);
    const [inPerson, video] = Array.from(
      section(el).querySelectorAll<HTMLInputElement>('.checks input[type=checkbox]'),
    );
    inPerson.click();
    await settle(fixture);
    expect(api.patch).not.toHaveBeenCalled();
    expect(section(el).querySelector('#booking-modalities-error')?.textContent?.trim()).toBe(
      'Gardez au moins une modalité.',
    );
    video.click();
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'booking.modalities': ['video'] }, expect.anything());
    expect(section(el).querySelector('#booking-modalities-error')).toBeNull();
    expect(inPerson.checked).toBe(false);
    expect(video.checked).toBe(true);
  });

  it('profil illisible : ni bandeau ni « Proposée… », les réglages restent là', async () => {
    const { el } = await render(
      withBooking({ 'booking.enabled': true, 'booking.windows': [MONDAY] }),
      claire,
      securityApi(),
      vi.fn().mockResolvedValue(true),
      { load: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }) },
    );
    expect(section(el).querySelector('.bar')).toBeNull();
    expect(status(el)).toBeNull();
    expect(section(el).querySelector('pm-booking-windows-editor')).not.toBeNull();
  });

  it('revue : « Proposée… » et le lien attendent la réponse du PATCH, et restent absents après un échec', async () => {
    const api = withBooking({ 'booking.windows': [MONDAY] });
    let reject: (reason: unknown) => void = () => undefined;
    api.patch.mockImplementationOnce(() => new Promise((_, fail) => (reject = fail)));
    const { fixture, el } = await render(api);
    section(el).querySelector<HTMLButtonElement>('mat-slide-toggle button')?.click();
    await settle(fixture);
    // PATCH en vol : l'interrupteur est déjà coché (optimiste), la fonction n'est pas encore offerte.
    expect(section(el).querySelector('mat-slide-toggle button')?.getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(pageLink(el)).toBeNull();
    expect(el.textContent).not.toContain('Proposée sur votre fiche publique.');

    reject({ status: 0, code: 'NETWORK_ERROR' });
    await settle(fixture);
    await settle(fixture);
    expect(pageLink(el)).toBeNull();
    expect(el.textContent).not.toContain('Proposée sur votre fiche publique.');
    expect(section(el).querySelector('mat-slide-toggle button')?.getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('revue : « Gardez au moins une modalité. » disparaît quand une relecture recoche la case', async () => {
    const api = withBooking({});
    const { fixture, el } = await render(api);
    const inPerson = section(el).querySelector<HTMLInputElement>('.checks input[type=checkbox]');
    inPerson?.click();
    await settle(fixture);
    expect(section(el).querySelector('#booking-modalities-error')?.textContent?.trim()).toBe(
      'Gardez au moins une modalité.',
    );
    await TestBed.inject(PreferencesStore).load();
    await settle(fixture);
    expect(inPerson?.checked).toBe(true);
    expect(section(el).querySelector('#booking-modalities-error')).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('revue : erreurs 422 reliées à leur contrôle (mode, activation, éditeur de plages)', async () => {
    const api = withBooking({ 'booking.enabled': true });
    const refuse = (field: string) => ({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field, code: 'INVALID_VALUE', message: `Refus ${field}` }],
    });
    api.patch
      .mockRejectedValueOnce(refuse('booking.confirmation'))
      .mockRejectedValueOnce(refuse('booking.enabled'))
      .mockRejectedValueOnce(refuse('booking.windows'));
    const { fixture, el } = await render(api);

    section(el).querySelector<HTMLInputElement>('input[name=booking-mode][value=auto]')?.click();
    await settle(fixture);
    const modeError = section(el).querySelector('#booking-confirmation-error');
    expect(modeError?.textContent?.trim()).toBe('Refus booking.confirmation');
    expect(
      section(el)
        .querySelector('fieldset[aria-labelledby="booking-mode-label"]')
        ?.getAttribute('aria-describedby'),
    ).toBe('booking-confirmation-error');

    section(el).querySelector<HTMLButtonElement>('mat-slide-toggle button')?.click();
    await settle(fixture);
    expect(section(el).querySelector('#booking-enabled-error')?.textContent?.trim()).toBe(
      'Refus booking.enabled',
    );
    expect(
      section(el).querySelector('mat-slide-toggle button')?.getAttribute('aria-describedby'),
    ).toContain('booking-enabled-error');

    const monday = section(el).querySelector<HTMLElement>('[aria-label="Plages du lundi"]');
    if (!monday) throw new Error('lundi absent');
    buttonIn(monday, 'Ajouter une plage').click();
    await settle(fixture);
    const [start, end] = Array.from(monday.querySelectorAll<HTMLInputElement>('input.time'));
    start.value = '09:00';
    start.dispatchEvent(new Event('input'));
    end.value = '12:00';
    end.dispatchEvent(new Event('input'));
    await settle(fixture);
    buttonIn(section(el), 'Enregistrer les plages').click();
    await settle(fixture);
    const editor = section(el).querySelector('pm-booking-windows-editor .editor[role=group]');
    expect(editor?.getAttribute('aria-labelledby')).toBe('booking-windows-label');
    const serverError = section(el).querySelector('pm-booking-windows-editor .error.server');
    expect(serverError?.textContent?.trim()).toBe('Refus booking.windows');
    expect(editor?.getAttribute('aria-describedby')).toBe(serverError?.id);
  });
});

function buttonIn(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`bouton absent : ${text}`);
  return found;
}
