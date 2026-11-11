import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { RegisterApi } from '../data/register.api';
import { NewPasswordPage } from './new-password.page';

// Fiche 26, étape 2 (UX-D4) : écran sans bloc de données chargé à l'affichage (le contrat n'a pas
// de GET du jeton) ; ses états sont ceux de l'envoi : saisie, envoi, remplacé (→ connexion),
// lien expiré (410), refusé (422, réseau).

async function render(confirmPasswordReset: ReturnType<typeof vi.fn>, token?: string) {
  TestBed.configureTestingModule({
    imports: [NewPasswordPage],
    providers: [provideRouter([]), { provide: RegisterApi, useValue: { confirmPasswordReset } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(NewPasswordPage);
  if (token) fixture.componentRef.setInput('token', token);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, navigate };
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`champ absent : ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
}

async function fillAndSubmit(
  fixture: ComponentFixture<NewPasswordPage>,
  el: HTMLElement,
  password = 'Vendôme-Lyon-2026!x',
  confirm = password,
): Promise<void> {
  type(el, 'new-password', password);
  type(el, 'new-password-confirm', confirm);
  await fixture.whenStable();
  el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
  await fixture.whenStable();
}

function criterion(el: HTMLElement, text: string): HTMLElement | undefined {
  return [...el.querySelectorAll<HTMLElement>('#new-password-criteria li')].find((li) =>
    li.textContent?.includes(text),
  );
}

describe('NewPasswordPage', () => {
  it('étape 2 sur 2 : titre, retour en haut, champs étiquetés, jauge et quatre critères', async () => {
    const { el } = await render(vi.fn(), 'jeton');
    expect(el.querySelector('.eyebrow')?.textContent).toContain('Étape 2 sur 2');
    expect(el.querySelector('h1')?.textContent).toContain('Choisissez un nouveau mot de passe');
    expect(el.querySelector('.back a')?.textContent).toContain('Retour à la connexion');
    expect(el.querySelector('label[for=new-password]')).not.toBeNull();
    expect(el.querySelector('label[for=new-password-confirm]')).not.toBeNull();
    expect(el.querySelectorAll('.bars .bar')).toHaveLength(4);
    expect(el.querySelectorAll('#new-password-criteria li')).toHaveLength(4);
    expect(el.textContent).toContain('valable 30 minutes');
    // Le contrat révoque toujours toutes les sessions : annoncé, pas de case à cocher.
    expect(el.querySelector('input[type=checkbox]')).toBeNull();
    expect(el.querySelector('.sessions')?.textContent).toContain('toutes les sessions');
  });

  it('critères en direct, état lu par les lecteurs d’écran ; la liste compromise reste au serveur', async () => {
    const { fixture, el } = await render(vi.fn(), 'jeton');
    expect(criterion(el, '12 caractères')?.textContent).toContain('à faire');
    type(el, 'new-password', 'Vendome-Lyon-2026');
    await fixture.whenStable();
    expect(criterion(el, '12 caractères')?.dataset['state']).toBe('met');
    expect(criterion(el, '12 caractères')?.textContent).toContain('validé');
    expect(criterion(el, 'Majuscules')?.dataset['state']).toBe('met');
    expect(criterion(el, 'chiffre')?.dataset['state']).toBe('met');
    expect(criterion(el, 'compromis')?.dataset['state']).toBe('server');
    expect(criterion(el, 'compromis')?.textContent).toContain("vérifié à l'enregistrement");
    expect(el.querySelector('#new-password-strength')?.textContent).toMatch(/· 17 caractères/);
  });

  it('afficher le mot de passe : aria-pressed et type text', async () => {
    const { fixture, el } = await render(vi.fn(), 'jeton');
    const toggle = el.querySelector<HTMLButtonElement>('button.toggle-password');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector<HTMLInputElement>('#new-password')?.type).toBe('text');
  });

  it('confirmation différente : message au blur, rien n’est envoyé', async () => {
    const confirm = vi.fn();
    const { fixture, el } = await render(confirm, 'jeton');
    await fillAndSubmit(fixture, el, 'Vendôme-Lyon-2026!x', 'Autre-Chose-2026!x');
    expect(confirm).not.toHaveBeenCalled();
    expect(el.querySelector('#new-password-confirm-error')?.textContent).toContain(
      'ne sont pas identiques',
    );
  });

  it('204 → /connexion avec le message « mot de passe modifié »', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const { fixture, el, navigate } = await render(confirm, 'jeton-valide');
    await fillAndSubmit(fixture, el);
    expect(confirm).toHaveBeenCalledWith('jeton-valide', 'Vendôme-Lyon-2026!x');
    expect(navigate).toHaveBeenCalledWith('/connexion', { state: { passwordChanged: true } });
  });

  it('410 → page « lien plus valable » avec nouvelle demande', async () => {
    const confirm = vi.fn().mockRejectedValue({ status: 410, code: 'TOKEN_INVALID_OR_EXPIRED' });
    const { fixture, el, navigate } = await render(confirm, 'vieux');
    await fillAndSubmit(fixture, el);
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('h1')?.textContent).toContain("n'est plus valable");
    const again = [...el.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Demander un nouveau lien'),
    );
    expect(again?.getAttribute('href')).toBe('/mot-de-passe-oublie');
  });

  it('sans jeton : page « lien plus valable » d’emblée, aucun appel', async () => {
    const confirm = vi.fn();
    const { el } = await render(confirm);
    expect(el.querySelector('h1')?.textContent).toContain("n'est plus valable");
    expect(el.querySelector('form')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('422 PASSWORD_POLICY : message du serveur sous le champ, saisie conservée', async () => {
    const confirm = vi.fn().mockRejectedValue({
      status: 422,
      code: 'PASSWORD_POLICY',
      errors: [
        { field: 'password', code: 'PASSWORD_COMPROMISED', message: 'Mot de passe trop courant.' },
      ],
    });
    const { fixture, el } = await render(confirm, 'jeton');
    await fillAndSubmit(fixture, el, 'Password2026!Abc');
    expect(el.querySelector('#new-password-error')?.textContent).toContain(
      'Mot de passe trop courant.',
    );
    expect(el.querySelector<HTMLInputElement>('#new-password')?.value).toBe('Password2026!Abc');
  });

  it('erreur réseau : message général role=alert, on peut réessayer', async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(undefined);
    const { fixture, el, navigate } = await render(confirm, 'jeton');
    await fillAndSubmit(fixture, el);
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enregistrement impossible');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/connexion', expect.anything());
  });
});
