import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideApiClient, SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { FirstLoginApi } from '../data/first-login.api';
import { LoginApi } from '../data/login.api';
import { FirstLoginPage, firstLoginStep } from './first-login.page';

const admin: SessionUser = {
  id: 'a1',
  email: 'hushan@example.test',
  displayName: 'Administrateur',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'admin',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

interface Mocks {
  changePassword?: ReturnType<typeof vi.fn>;
  login?: ReturnType<typeof vi.fn>;
}

async function render(me: SessionUser | null, mocks: Mocks = {}) {
  TestBed.configureTestingModule({
    imports: [FirstLoginPage],
    providers: [
      provideRouter([]),
      { provide: FirstLoginApi, useValue: { changePassword: mocks.changePassword ?? vi.fn() } },
      { provide: LoginApi, useValue: { login: mocks.login ?? vi.fn() } },
      // L'étape 2 (composant de features/account) parle au client généré : HTTP simulé.
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient(),
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(me) } },
    ],
  });
  if (me) TestBed.inject(SessionStore).signIn(me);
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FirstLoginPage);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    navigateByUrl,
    http: TestBed.inject(HttpTestingController),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`champ absent : ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function fillPasswordForm(el: HTMLElement, email = admin.email): void {
  if (!el.querySelector<HTMLInputElement>('#field-firstLogin-email')?.readOnly) {
    type(el, 'field-firstLogin-email', email);
  }
  type(el, 'field-firstLogin-currentPassword', 'MotDePasseTemporaire20');
  type(el, 'field-firstLogin-newPassword', 'Nouveau-Mot-De-Passe-2026');
  type(el, 'field-firstLogin-confirm', 'Nouveau-Mot-De-Passe-2026');
}

describe('firstLoginStep', () => {
  it('sans session ou mot de passe à remplacer : password ; admin sans 2FA : twoFactor ; sinon done', () => {
    expect(firstLoginStep(null)).toBe('password');
    expect(firstLoginStep({ ...admin, passwordChangeRequired: true })).toBe('password');
    expect(firstLoginStep(admin)).toBe('twoFactor');
    expect(firstLoginStep({ ...admin, twoFactorEnabled: true })).toBe('done');
    expect(firstLoginStep({ ...admin, role: 'practitioner' })).toBe('done');
  });
});

describe('FirstLoginPage (fiche 18 C)', () => {
  it('sans session : étape 1, e-mail saisissable, progression 1/2, lien retour à la connexion', async () => {
    const { el } = await render(null);
    expect(el.querySelector('h2')?.textContent).toContain('Choisissez votre mot de passe');
    expect(el.querySelector<HTMLInputElement>('#field-firstLogin-email')?.readOnly).toBe(false);
    expect(el.querySelector('.progress [aria-current=step]')?.textContent).toContain(
      'Choisissez votre mot de passe',
    );
    expect(el.querySelector('.warning')?.textContent).toContain("page d'administration");
    expect(el.querySelector('a.bar-link')?.textContent).toContain('Retour à la connexion');
    expect(el.querySelector('pm-password-rules')).not.toBeNull();
  });

  it('session avec mot de passe à remplacer : e-mail pré-rempli en lecture seule, bouton Se déconnecter', async () => {
    const { el } = await render({ ...admin, passwordChangeRequired: true });
    const email = el.querySelector<HTMLInputElement>('#field-firstLogin-email');
    expect(email?.value).toBe(admin.email);
    expect(email?.readOnly).toBe(true);
    expect(el.querySelector('button.bar-link')?.textContent).toContain('Se déconnecter');
  });

  it('204 puis reconnexion : un admin sans 2FA passe à l’étape 2 (activation embarquée, enable appelé)', async () => {
    const { fixture, el, http } = await render(null, {
      changePassword: vi.fn().mockResolvedValue('changed'),
      login: vi.fn().mockResolvedValue({ kind: 'signed-in', user: admin }),
    });
    fillPasswordForm(el);
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(el.querySelector('h2')?.textContent).toContain('Activez la double authentification');
    expect(el.querySelector('.progress [aria-current=step]')?.textContent).toContain(
      'Activez la double authentification',
    );
    expect(el.querySelector('pm-two-factor-setup')).not.toBeNull();
    expect(http.match((r) => r.url.endsWith('/api/me/2fa/enable'))).toHaveLength(1);
    const open = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes("Ouvrir l'administration"),
    );
    expect(open?.disabled).toBe(true);
  });

  it('422 PASSWORD_POLICY : la règle fautive est cochée en erreur ; 401 : message unique', async () => {
    const changePassword = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'PASSWORD_POLICY',
        errors: [{ field: 'password', code: 'PASSWORD_COMPROMISED', message: 'Trop courant.' }],
      })
      .mockRejectedValueOnce({ status: 401, code: 'INVALID_CREDENTIALS' });
    const { fixture, el } = await render(null, { changePassword });
    fillPasswordForm(el);
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(el.querySelector('pm-password-rules li[data-state=ko]')?.textContent).toContain(
      'Trop courant.',
    );
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(el.querySelector('.banner--danger')?.textContent).toContain(
      'E-mail, mot de passe temporaire ou code incorrect.',
    );
  });

  it('423 : verrou affiché, bouton désactivé', async () => {
    const { fixture, el } = await render(null, {
      changePassword: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 120 }),
    });
    fillPasswordForm(el);
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(el.querySelector('pm-lock-notice [role=alert]')?.textContent).toContain(
      'Réessayez dans',
    );
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
  });

  it('plus rien d’exigé : redirection (admin équipé → /admin)', async () => {
    const { navigateByUrl } = await render({ ...admin, twoFactorEnabled: true });
    expect(navigateByUrl).toHaveBeenCalledWith('/admin');
  });
});
