import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideApiClient } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmEmailApi } from '../data/confirm-email.api';
import { FirstLoginApi } from '../data/first-login.api';
import { LoginApi } from '../data/login.api';
import { RegisterApi } from '../data/register.api';
import { SuspendedApi } from '../data/suspended.api';
import { ConfirmEmailPage, errorMessage } from './confirm-email.page';
import { FirstLoginPage } from './first-login.page';
import { LoginPage } from './login.page';
import { NewPasswordPage } from './new-password.page';
import { PasswordResetPage } from './password-reset.page';
import { RegisterPage } from './register.page';
import { SuspendedPage } from './suspended.page';

// M16-10, features/auth de droite à gauche (Q73, Q77 ; docs/design/arabe.md §5, §7). Le sens des
// champs : contenu saisi (nom, prénom, adresse, recours) en dir="auto", valeurs sans sens de lecture
// (e-mail, mot de passe, code, numéro, téléphone) en dir="ltr", donc dans l'ordre de frappe. Le
// rendu (direction calculée, alignement du côté de début de la page) est mesuré par
// e2e/arabe/auth.spec.ts ; ici, la présence du sens sur chaque champ et les délais en arabe.

/** Chiffres arabo-indiens (U+0660 à U+0669) et persans (U+06F0 à U+06F9). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;

async function render<T>(
  component: Type<T>,
  providers: unknown[] = [],
  locale = 'fr',
  inputs: Record<string, unknown> = {},
) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(null) } },
      ...(providers as never[]),
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Sens déclaré de chaque champ, par autocomplete (ou id) : « dir » ou « absent ». */
function directions(el: HTMLElement): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type=checkbox]):not([type=radio]), textarea',
  )) {
    const key = field.getAttribute('autocomplete') ?? field.id;
    result[key] = field.getAttribute('dir') ?? 'absent';
  }
  return result;
}

describe('features/auth · sens des champs (Q77)', () => {
  it('connexion : e-mail et mot de passe en dir="ltr"', async () => {
    const { el } = await render(LoginPage, [{ provide: LoginApi, useValue: { login: vi.fn() } }]);
    expect(directions(el)).toEqual({ username: 'ltr', 'current-password': 'ltr' });
  });

  it('connexion, double authentification : le code en dir="ltr"', async () => {
    const login = vi.fn().mockResolvedValue({ kind: 'otp-required' });
    const { fixture, el } = await render(LoginPage, [{ provide: LoginApi, useValue: { login } }]);
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('#login-email', 'claire@example.test');
    type('#login-password', 'Donnees-Fictives-2026');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('#login-otp')?.getAttribute('dir')).toBe('ltr');
  });

  it('inscription : nom, prénom et adresse en dir="auto", le reste en dir="ltr"', async () => {
    const { el } = await render(RegisterPage, [
      { provide: RegisterApi, useValue: { register: vi.fn() } },
    ]);
    expect(directions(el)).toEqual({
      'given-name': 'auto',
      'family-name': 'auto',
      email: 'ltr',
      // Numéro ADELI ou RPPS (autocomplete="off").
      off: 'ltr',
      tel: 'ltr',
      'street-address': 'auto',
      'postal-code': 'ltr',
      'address-level2': 'auto',
      'new-password': 'ltr',
    });
    // Les deux champs de mot de passe (même autocomplete).
    const passwords = el.querySelectorAll('input[autocomplete=new-password][dir=ltr]');
    expect(passwords.length).toBe(2);
  });

  it('mot de passe oublié : e-mail en dir="ltr", flèche de retour retournée en RTL', async () => {
    const { el } = await render(PasswordResetPage, [
      { provide: RegisterApi, useValue: { requestPasswordReset: vi.fn() } },
    ]);
    expect(directions(el)).toEqual({ username: 'ltr' });
    expect(el.querySelector('.back .pm-flip-rtl')?.textContent).toBe('←');
  });

  it('nouveau mot de passe : deux champs en dir="ltr", flèche de retour retournée', async () => {
    const { el } = await render(
      NewPasswordPage,
      [{ provide: RegisterApi, useValue: { confirmPasswordReset: vi.fn() } }],
      'fr',
      { token: 'jeton' },
    );
    expect(el.querySelectorAll('input[autocomplete=new-password][dir=ltr]').length).toBe(2);
    expect(el.querySelector('.back .pm-flip-rtl')?.textContent).toBe('←');
  });

  it('confirmation d’e-mail, lien expiré : e-mail en dir="ltr"', async () => {
    const { fixture, el } = await render(ConfirmEmailPage, [
      { provide: ConfirmEmailApi, useValue: {} },
    ]);
    fixture.componentRef.setInput('mode', 'expired');
    await fixture.whenStable();
    expect(directions(el)).toEqual({ username: 'ltr' });
  });

  it('compte suspendu : identifiants en dir="ltr", recours en dir="auto", compteur isolé en ltr', async () => {
    sessionStorage.clear();
    const { el } = await render(SuspendedPage, [{ provide: SuspendedApi, useValue: {} }]);
    expect(directions(el)).toEqual({
      username: 'ltr',
      'current-password': 'ltr',
      'field-message': 'auto',
    });
    expect(el.querySelector('#message-count bdi')?.getAttribute('dir')).toBe('ltr');
  });

  it('première connexion : e-mail et mots de passe en dir="ltr"', async () => {
    const { el } = await render(FirstLoginPage, [
      { provide: FirstLoginApi, useValue: { changePassword: vi.fn() } },
      { provide: LoginApi, useValue: { login: vi.fn() } },
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient(),
    ]);
    const fields = [...el.querySelectorAll('input')];
    expect(fields.length).toBe(4);
    expect(fields.every((field) => field.getAttribute('dir') === 'ltr')).toBe(true);
  });
});

describe('features/auth · délais en arabe (Q73)', () => {
  it('423 de la confirmation : délai en chiffres latins par core/i18n', () => {
    const text = errorMessage(
      { status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 872 } as never,
      'ar',
    );
    expect(text).toMatch(/14\D+32/);
    expect(text).not.toMatch(NON_LATIN_DIGITS);
  });

  it('423 du compte suspendu, bundle arabe : délai en chiffres latins', async () => {
    sessionStorage.clear();
    const requestExport = vi
      .fn()
      .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 });
    const { fixture, el } = await render(
      SuspendedPage,
      [{ provide: SuspendedApi, useValue: { requestExport } }],
      'ar',
    );
    const type = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('field-email', 'marc@example.test');
    type('field-password', 'Secret-Clinique-2026');
    el.querySelector<HTMLButtonElement>('#export-button')!.click();
    await fixture.whenStable();
    const note = el.querySelector('#export-note')?.textContent ?? '';
    expect(note).toMatch(/1[45]/);
    expect(note).not.toMatch(NON_LATIN_DIGITS);
    fixture.destroy();
  });

  it('423 de la connexion, bundle arabe : compte à rebours « m:ss » en chiffres latins', async () => {
    const login = vi
      .fn()
      .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 125 });
    const { fixture, el } = await render(
      LoginPage,
      [{ provide: LoginApi, useValue: { login } }],
      'ar',
    );
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('#login-email', 'claire@example.test');
    type('#login-password', 'Donnees-Fictives-2026');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    const alert = el.querySelector('[role=alert]')?.textContent ?? '';
    expect(alert).toMatch(/2:0[45]/);
    expect(alert).not.toMatch(NON_LATIN_DIGITS);
    fixture.destroy();
  });
});
