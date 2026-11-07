import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { LoginApi } from '../data/login.api';
import { LoginPage } from './login.page';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

async function render(login: ReturnType<typeof vi.fn>, next?: string) {
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]),
      { provide: LoginApi, useValue: { login } },
      { provide: SessionApi, useValue: {} },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginPage);
  if (next) fixture.componentRef.setInput('next', next);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`champ absent : ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function submit(fixture: ComponentFixture<LoginPage>, el: HTMLElement): Promise<void> {
  type(el, 'input[type=email]', 'claire@example.test');
  type(el, 'input[type=password]', 'Donnees-Fictives-2026');
  el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
  await fixture.whenStable();
}

describe('LoginPage', () => {
  it('formulaire étiqueté, sans bloc code au départ', async () => {
    const { el } = await render(vi.fn());
    expect(el.querySelector('form')?.getAttribute('aria-labelledby')).toBe('login-title');
    expect(el.querySelector('#login-title')?.textContent).toContain('Connexion');
    expect(el.querySelector('input[autocomplete=username]')).not.toBeNull();
    expect(el.querySelector('input[autocomplete=one-time-code]')).toBeNull();
  });

  it('liens Créer un compte et Mot de passe oublié, mention du verrouillage (fiche 11)', async () => {
    const { el } = await render(vi.fn());
    const links = [...el.querySelectorAll('a')].map((a) => a.textContent?.trim());
    expect(links).toContain('Créer un compte');
    expect(links).toContain('Mot de passe oublié ?');
    expect(el.textContent).toContain('verrouillé 15 minutes');
  });

  it('afficher le mot de passe : aria-pressed et type text', async () => {
    const { fixture, el } = await render(vi.fn());
    const toggle = el.querySelector<HTMLButtonElement>('button.toggle-password');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    // Le clic ne remonte pas au conteneur mat-form-field (qui rendrait le focus au champ).
    const reachedForm = vi.fn();
    el.querySelector('form')?.addEventListener('click', reachedForm);
    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(reachedForm).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLInputElement>('input[autocomplete=current-password]')?.type).toBe(
      'text',
    );
  });

  it('code de secours : le champ code passe en texte libre', async () => {
    const login = vi.fn().mockResolvedValueOnce({ kind: 'otp-required' });
    const { fixture, el } = await render(login);
    await submit(fixture, el);
    const otp = el.querySelector<HTMLInputElement>('input[autocomplete=one-time-code]');
    expect(otp?.getAttribute('inputmode')).toBe('numeric');
    [...el.querySelectorAll<HTMLButtonElement>('button.link-button')]
      .find((b) => b.textContent?.includes('code de secours'))
      ?.click();
    await fixture.whenStable();
    expect(otp?.getAttribute('inputmode')).toBe('text');
    expect(el.textContent).toContain('codes de secours');
  });

  it('champs vides : rien n’est envoyé', async () => {
    const login = vi.fn();
    const { fixture, el } = await render(login);
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(login).not.toHaveBeenCalled();
  });

  it('200 : triage vers ?next=', async () => {
    const login = vi.fn().mockResolvedValue({ kind: 'signed-in', user: claire });
    const { fixture, el, navigate } = await render(login, '/patients/42');
    await submit(fixture, el);
    expect(login).toHaveBeenCalledWith({
      email: 'claire@example.test',
      password: 'Donnees-Fictives-2026',
      otp: undefined,
      rememberMe: false,
    });
    expect(navigate).toHaveBeenCalledWith('/patients/42');
  });

  it('202 : le bloc code apparaît, puis le code part avec la deuxième requête', async () => {
    const login = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'otp-required' })
      .mockResolvedValueOnce({ kind: 'signed-in', user: claire });
    const { fixture, el, navigate } = await render(login);
    await submit(fixture, el);

    const otp = el.querySelector<HTMLInputElement>('input[autocomplete=one-time-code]');
    expect(otp).not.toBeNull();
    expect(otp?.getAttribute('inputmode')).toBe('numeric');

    type(el, 'input[autocomplete=one-time-code]', ' 123456 ');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ otp: '123456' }));
    expect(navigate).toHaveBeenCalledWith('/patients');
  });

  it('401 : message unique dans une alerte', async () => {
    const login = vi.fn().mockRejectedValue({ status: 401, code: 'INVALID_CREDENTIALS' });
    const { fixture, el } = await render(login);
    await submit(fixture, el);
    const alert = el.querySelector('[role=alert]');
    expect(alert?.textContent).toContain('E-mail, mot de passe ou code incorrect.');
  });

  it('423 : compte à rebours, bouton désactivé', async () => {
    const login = vi
      .fn()
      .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 125 });
    const { fixture, el } = await render(login);
    await submit(fixture, el);
    expect(el.querySelector('[role=alert]')?.textContent).toMatch(/Réessayez dans 2:0[45]/);
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    fixture.destroy();
  });
});
