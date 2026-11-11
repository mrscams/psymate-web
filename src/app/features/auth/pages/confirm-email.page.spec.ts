import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmEmailApi } from '../data/confirm-email.api';
import { ConfirmEmailStore } from '../data/confirm-email.store';
import { ConfirmEmailMode, ConfirmEmailPage, formatCountdown } from './confirm-email.page';

const alix: SessionUser = {
  id: '1',
  email: 'alix@example.test',
  displayName: 'Alix Essai',
  profession: 'psychologist',
  verificationStatus: 'docs_pending',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

interface RenderOptions {
  mode?: ConfirmEmailMode;
  token?: string;
  email?: string;
}

async function render(api: Partial<ConfirmEmailApi>, options: RenderOptions = {}) {
  TestBed.configureTestingModule({
    imports: [ConfirmEmailPage],
    providers: [
      provideRouter([]),
      { provide: ConfirmEmailApi, useValue: api },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(alix) } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const store = TestBed.inject(ConfirmEmailStore);
  if (options.email) store.remember(options.email);
  const fixture = TestBed.createComponent(ConfirmEmailPage);
  fixture.componentRef.setInput('mode', options.mode ?? 'pending');
  if (options.token) fixture.componentRef.setInput('token', options.token);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate, store };
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`champ absent : ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function click(fixture: ComponentFixture<ConfirmEmailPage>, el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`bouton absent : ${text}`);
  button.click();
  await fixture.whenStable();
}

describe('ConfirmEmailPage · en attente', () => {
  it('adresse connue : titre, adresse en monospace, trois étapes, bouton Renvoyer actif, aucun champ', async () => {
    const { el } = await render({}, { email: 'alix@example.test' });
    expect(el.querySelector('h1')?.textContent).toContain(
      'Un dernier clic : confirmez votre e-mail',
    );
    expect(el.querySelector('.lead .mono')?.textContent).toBe('alix@example.test');
    expect(el.querySelectorAll('ol.steps li')).toHaveLength(3);
    const resend = el.querySelector<HTMLButtonElement>('button.resend');
    expect(resend?.getAttribute('aria-disabled')).not.toBe('true');
    expect(el.querySelector('#field-email')).toBeNull();
    expect(el.textContent).toContain('La vérification des diplômes est indépendante');
  });

  it('adresse inconnue : champ e-mail, rien ne part tant qu’il est vide', async () => {
    const resend = vi.fn();
    const { fixture, el } = await render({ resend });
    expect(el.querySelector('#field-email')).not.toBeNull();
    await click(fixture, el, 'Renvoyer le lien');
    expect(resend).not.toHaveBeenCalled();
    expect(el.querySelector('#field-email-error')?.textContent).toContain('obligatoire');
  });

  it('UX-D3 · adresse inconnue : un seul geste (« Adresse du compte » + « Renvoyer le lien »), pas de « Corriger l’e-mail »', async () => {
    const { el } = await render({});
    expect(el.querySelector('label[for=field-email]')?.textContent).toContain('Adresse du compte');
    expect(el.querySelector('#field-email-hint')?.textContent).toContain('Pas reçu ?');
    const buttons = [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons).toContain('Renvoyer le lien');
    expect(el.querySelector('#change-toggle')).toBeNull();
  });

  it('UX-D3 · adresse connue : « Corriger l’e-mail » proposé, sans champ d’adresse', async () => {
    const { el } = await render({}, { email: 'alix@example.test' });
    expect(el.querySelector('#field-email')).toBeNull();
    expect(el.querySelector('#change-toggle')?.textContent).toContain("Corriger l'e-mail");
  });

  it('Renvoyer : 202 → message role=status, bouton aria-disabled et compte à rebours (fiche 25)', async () => {
    const resend = vi.fn().mockResolvedValue(undefined);
    const { fixture, el } = await render({ resend }, { email: 'alix@example.test' });
    await click(fixture, el, 'Renvoyer le lien');
    expect(resend).toHaveBeenCalledWith('alix@example.test');
    expect(el.querySelector('.banner.ok')?.getAttribute('role')).toBe('status');
    const button = el.querySelector<HTMLButtonElement>('button.resend');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    // Reste focusable et explique pourquoi.
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-describedby')).toBe('resend-cooldown');
    const cooldown = el.querySelector('#resend-cooldown');
    expect(cooldown?.getAttribute('role')).toBe('status');
    expect(cooldown?.textContent).toMatch(/Nouveau renvoi possible dans\s+(1:00|0:59)/);
    // Second clic pendant le délai : rien ne part (le serveur refuserait en silence).
    await click(fixture, el, 'Renvoyer le lien');
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('Renvoyer : erreur réseau → message role=alert', async () => {
    const { fixture, el } = await render(
      { resend: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }) },
      { email: 'alix@example.test' },
    );
    await click(fixture, el, 'Renvoyer le lien');
    expect(el.querySelector('.banner.error')?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.banner.error')?.textContent).toContain('Envoi impossible');
  });

  it('Corriger l’e-mail : formulaire en place, 202 → la carte affiche la nouvelle adresse', async () => {
    const changeEmail = vi.fn().mockResolvedValue(undefined);
    const { fixture, el } = await render({ changeEmail }, { email: 'alix@example.test' });
    const toggle = el.querySelector<HTMLButtonElement>('#change-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#change-form')).not.toBeNull();
    // L'adresse actuelle est connue : seuls mot de passe et nouvelle adresse sont demandés.
    expect(el.querySelector('#change-form #field-email')).toBeNull();
    type(el, 'field-password', 'Secret-Clinique-2026');
    type(el, 'field-newEmail', 'nouvelle@example.test');
    await click(fixture, el, 'Envoyer le lien à la nouvelle adresse');
    expect(changeEmail).toHaveBeenCalledWith(
      'alix@example.test',
      'Secret-Clinique-2026',
      'nouvelle@example.test',
    );
    expect(el.querySelector('#change-form')).toBeNull();
    expect(el.querySelector('.lead .mono')?.textContent).toBe('nouvelle@example.test');
    expect(el.querySelector('.banner.ok')?.textContent).toContain('nouvelle@example.test');
  });

  it('Corriger l’e-mail : 422 relié aux champs par applyProblem', async () => {
    const changeEmail = vi.fn().mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'newEmail', code: 'INVALID_FIELD', message: 'Adresse mal formée.' }],
    });
    const { fixture, el } = await render({ changeEmail }, { email: 'alix@example.test' });
    el.querySelector<HTMLButtonElement>('#change-toggle')?.click();
    await fixture.whenStable();
    type(el, 'field-password', 'Secret-Clinique-2026');
    type(el, 'field-newEmail', 'nouvelle@example.test');
    await click(fixture, el, 'Envoyer le lien à la nouvelle adresse');
    expect(el.querySelector('#field-newEmail-error')?.textContent).toBe('Adresse mal formée.');
    expect(el.querySelector('#change-form')).not.toBeNull();
  });

  it('session déjà confirmée (autre onglet) : la page part d’elle-même vers /patients', async () => {
    const { navigate } = await render({}, {});
    const session = TestBed.inject(SessionApi);
    const sessionStore = (await import('../../../core/auth')).SessionStore;
    const store = TestBed.inject(sessionStore);
    store.signIn(alix);
    expect(session).toBeDefined();
    // Nouvelle instance de la page avec une session confirmée : triage habituel.
    const fixture = TestBed.createComponent(ConfirmEmailPage);
    fixture.componentRef.setInput('mode', 'pending');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/patients');
  });
});

describe('ConfirmEmailPage · traitement du lien', () => {
  it('204 → session rechargée (GET /api/auth/me) puis /patients', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const { navigate, el } = await render({ confirm }, { mode: 'token', token: 'jeton-valide' });
    expect(confirm).toHaveBeenCalledWith('jeton-valide');
    expect(navigate).toHaveBeenCalledWith('/patients', { replaceUrl: true });
    expect(el.querySelector('h1')?.textContent).toContain('Confirmation de votre adresse');
  });

  it('410 → /confirmer-email/expire, aucune session', async () => {
    const confirm = vi.fn().mockRejectedValue({ status: 410, code: 'TOKEN_INVALID_OR_EXPIRED' });
    const { navigate } = await render({ confirm }, { mode: 'token', token: 'vieux' });
    expect(navigate).toHaveBeenCalledWith('/confirmer-email/expire', { replaceUrl: true });
    expect(navigate).not.toHaveBeenCalledWith('/patients', expect.anything());
  });

  it('erreur réseau → état erreur avec Réessayer (le lien reste valable)', async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(undefined);
    const { fixture, el, navigate } = await render({ confirm }, { mode: 'token', token: 'jeton' });
    const error = el.querySelector('pm-state [role=alert]');
    expect(error?.textContent).toContain('Impossible de vérifier ce lien');
    expect(navigate).not.toHaveBeenCalled();
    await click(fixture, el, 'Réessayer');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/patients', { replaceUrl: true });
  });

  it('pendant l’appel : squelette aria-busy', async () => {
    const confirm = vi.fn().mockReturnValue(new Promise(() => undefined));
    const { el } = await render({ confirm }, { mode: 'token', token: 'jeton' });
    expect(el.querySelector('pm-state [aria-busy=true]')).not.toBeNull();
  });
});

describe('ConfirmEmailPage · lien expiré', () => {
  it('titre, champ e-mail, note anti-énumération, lien Se connecter', async () => {
    const { el } = await render({}, { mode: 'expired' });
    expect(el.querySelector('h1')?.textContent).toContain('Ce lien de confirmation a expiré');
    expect(el.querySelector('#field-email')).not.toBeNull();
    expect(el.querySelector('#resend-note')?.textContent).toContain(
      "Nous ne confirmons pas l'existence d'un compte",
    );
    expect([...el.querySelectorAll('a')].map((a) => a.textContent?.trim())).toContain(
      'Se connecter',
    );
  });

  it('Recevoir un nouveau lien : adresse saisie → 202 → message, délai d’une minute', async () => {
    const resend = vi.fn().mockResolvedValue(undefined);
    const { fixture, el } = await render({ resend }, { mode: 'expired' });
    type(el, 'field-email', 'alix@example.test');
    await click(fixture, el, 'Recevoir un nouveau lien');
    expect(resend).toHaveBeenCalledWith('alix@example.test');
    expect(el.querySelector('.banner.ok')?.getAttribute('role')).toBe('status');
    expect(el.querySelector('button.resend')?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('formatCountdown', () => {
  it('minutes:secondes sur deux chiffres', () => {
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
