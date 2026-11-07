import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PreferencesApi } from '../../../core/preferences/data/preferences.api';
import { LocaleNavigator } from '../../../core/preferences/locale-navigator';
import { defaultPreferences, Preferences } from '../../../core/preferences/preferences.model';
import { ToastService } from '../../../shared/ui';
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

async function render(api: Api, user: SessionUser = claire) {
  TestBed.configureTestingModule({
    imports: [PreferencesPage],
    providers: [
      provideRouter([]),
      { provide: PreferencesApi, useValue: api },
      { provide: SessionApi, useValue: {} },
      { provide: LocaleNavigator, useValue: { current: 'fr', goTo: vi.fn() } },
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
    expect(el.querySelector('pm-state .error[role="alert"]')).not.toBeNull();
    expect(el.querySelector('section.card')).toBeNull();

    const retry = el.querySelector<HTMLButtonElement>('pm-state button.retry');
    expect(retry?.textContent?.trim()).toBe('Réessayer');
    retry?.click();
    await settle(fixture);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-state .error')).toBeNull();
    expect(el.querySelectorAll('section.card')).toHaveLength(4);
  });

  it('chargé : quatre sections, valeurs serveur reflétées, résumé sécurité', async () => {
    const api = serverFor({
      ...defaultPreferences('psychologist'),
      'overview.window': '12m',
      theme: 'soft',
      'sessions.defaultDurationMin': 45,
    });
    const { el } = await render(api, { ...claire, twoFactorEnabled: true });
    expect(el.querySelector('h1')?.textContent).toBe('Préférences');
    expect(el.querySelectorAll('section.card')).toHaveLength(4);
    expect(pressed(el, 'overview-view')).toEqual(['Simple']);
    expect(pressed(el, 'overview-window')).toEqual(['1 an']);
    expect(el.querySelector<HTMLInputElement>('input[type=radio][value=soft]')?.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input.number')?.value).toBe('45');
    expect(el.querySelector('.summary')?.textContent).toContain('claire@example.test');
    expect(el.querySelector('.summary dd.success')?.textContent).toBe('Activée');
    expect(el.querySelector('a[href="/mon-compte/emotions"]')).not.toBeNull();
    expect(el.querySelector('a[href="/mon-compte/securite"]')).not.toBeNull();
  });

  it('un réglage change : aria-pressed tout de suite, PATCH de la seule clé, « Enregistré »', async () => {
    const api = serverFor(defaultPreferences('psychologist'));
    const { fixture, el } = await render(api);
    buttonNamed(el, 'overview-view', 'Complète').click();
    await fixture.whenStable();
    expect(pressed(el, 'overview-view')).toEqual(['Complète']);
    await settle(fixture);
    expect(api.patch).toHaveBeenCalledWith({ 'overview.view': 'complete' }, expect.anything());
    expect(el.querySelector('.saved')?.textContent).toMatch(/^Enregistré à \d{1,2}:\d{2}$/);
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
    const group = el.querySelector('[role=group][aria-labelledby="overview-view-label"]');
    expect(group?.getAttribute('aria-describedby')).toBe('overview-view-help');
    expect(el.querySelector('#overview-view-label')?.textContent).toBe("Vue d'ensemble par défaut");
    expect(el.querySelector('[role=radiogroup][aria-labelledby="theme-label"]')).not.toBeNull();
    expect(el.querySelectorAll('input[type=radio][name=theme]')).toHaveLength(4);
    expect(el.querySelector('select[aria-labelledby="locale-label"]')).not.toBeNull();
  });
});
