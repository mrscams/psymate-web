import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { RegisterApi } from '../data/register.api';
import { RegisterPage } from './register.page';

async function render(register: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [RegisterPage],
    providers: [provideRouter([]), { provide: RegisterApi, useValue: { register } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(RegisterPage);
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

function check(el: HTMLElement, id: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`case absente : ${id}`);
  input.click();
}

async function fillValid(fixture: ComponentFixture<RegisterPage>, el: HTMLElement): Promise<void> {
  type(el, 'field-firstName', 'Alix');
  type(el, 'field-lastName', 'Essai');
  type(el, 'field-email', 'alix@example.test');
  check(el, 'field-profession-coach');
  type(el, 'field-phone', '06 12 34 56 78');
  check(el, 'field-remoteOnly');
  type(el, 'field-password', 'Vendôme-Lyon-2026!x');
  type(el, 'field-passwordConfirm', 'Vendôme-Lyon-2026!x');
  check(el, 'field-terms');
  await fixture.whenStable();
}

async function submit(fixture: ComponentFixture<RegisterPage>, el: HTMLElement): Promise<void> {
  el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
  await fixture.whenStable();
}

describe('RegisterPage', () => {
  it('trois sections, cartes de profession en vrais boutons radio, autocomplétion navigateur', async () => {
    const { el } = await render(vi.fn());
    expect(el.querySelectorAll('form section h2').length).toBeGreaterThanOrEqual(3);
    const radios = el.querySelectorAll('fieldset.professions input[type=radio]');
    expect(radios).toHaveLength(3);
    expect(el.querySelector('fieldset.professions legend')?.textContent).toContain('Profession');
    expect(el.querySelector('input[autocomplete=given-name]')).not.toBeNull();
    expect(el.querySelector('input[autocomplete=new-password]')).not.toBeNull();
    expect(el.querySelector('input[autocomplete=postal-code]')).not.toBeNull();
    // Aucun code d'invitation (G Q21).
    expect(el.textContent).not.toMatch(/invitation/i);
  });

  it('formulaire vide : rien n’est envoyé, résumé des erreurs en tête', async () => {
    const register = vi.fn();
    const { fixture, el } = await render(register);
    await submit(fixture, el);
    expect(register).not.toHaveBeenCalled();
    const summary = el.querySelector('pm-problem-summary [role=alert]');
    expect(summary?.textContent).toContain('champs à corriger');
    expect(summary?.textContent).toContain('Prénom');
  });

  it('visio uniquement : l’adresse est désactivée et n’est plus requise', async () => {
    const { fixture, el } = await render(vi.fn());
    check(el, 'field-remoteOnly');
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#field-address-street')?.disabled).toBe(true);
    expect(el.querySelector<HTMLInputElement>('#field-address-postalCode')?.required).toBe(false);
  });

  it('jauge de force : texte, jamais la couleur seule', async () => {
    const { fixture, el } = await render(vi.fn());
    type(el, 'field-password', 'court');
    await fixture.whenStable();
    expect(el.querySelector('#field-password-strength')?.textContent).toMatch(/Trop court/);
    type(el, 'field-password', 'Vendôme-Lyon-2026!x');
    await fixture.whenStable();
    expect(el.querySelector('#field-password-strength')?.textContent).toMatch(
      /Fort · 19 caractères/,
    );
    expect(el.querySelectorAll('.bar.on')).toHaveLength(4);
  });

  it('confirmation différente : message sous le champ', async () => {
    const { fixture, el } = await render(vi.fn());
    type(el, 'field-password', 'Vendôme-Lyon-2026!x');
    type(el, 'field-passwordConfirm', 'Autre-Chose-2026!x');
    await fixture.whenStable();
    expect(el.querySelector('#field-passwordConfirm-error')?.textContent).toContain(
      'ne sont pas identiques',
    );
  });

  it('201 : l’inscription part sans adresse en visio, puis /confirmer-email', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const { fixture, el, navigate } = await render(register);
    await fillValid(fixture, el);
    await submit(fixture, el);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alix@example.test',
        profession: 'coach',
        remoteOnly: true,
        phone: '06 12 34 56 78',
        consents: { terms: true, privacy: true },
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/confirmer-email', expect.anything());
  });

  it('422 PASSWORD_POLICY : le message du serveur sous le champ mot de passe, saisie conservée', async () => {
    const register = vi.fn().mockRejectedValue({
      status: 422,
      code: 'PASSWORD_POLICY',
      errors: [
        { field: 'password', code: 'PASSWORD_COMPROMISED', message: 'Mot de passe trop courant.' },
      ],
    });
    const { fixture, el, navigate } = await render(register);
    await fillValid(fixture, el);
    await submit(fixture, el);
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('#field-password-error')?.textContent).toContain(
      'Mot de passe trop courant.',
    );
    expect(el.querySelector<HTMLInputElement>('#field-email')?.value).toBe('alix@example.test');
    expect(el.querySelector('pm-problem-summary [role=alert]')?.textContent).toContain(
      '1 champ à corriger',
    );
  });

  it('422 sur consents.terms : relié à la case unique des consentements', async () => {
    const register = vi.fn().mockRejectedValue({
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'consents.privacy', code: 'INVALID_FIELD', message: 'Requis.' }],
    });
    const { fixture, el } = await render(register);
    await fillValid(fixture, el);
    await submit(fixture, el);
    expect(el.querySelector('#field-terms-error')?.textContent).toContain('Requis.');
  });

  it('erreur réseau : message général, rien n’est perdu', async () => {
    const register = vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    const { fixture, el } = await render(register);
    await fillValid(fixture, el);
    await submit(fixture, el);
    expect(el.querySelector('pm-problem-summary [role=alert]')?.textContent).toContain(
      'Inscription impossible pour le moment',
    );
  });
});
