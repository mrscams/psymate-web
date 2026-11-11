import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ApiProblem } from '../../../core/http';
import { RegisterApi } from '../data/register.api';
import { PasswordResetPage } from './password-reset.page';

// Fiche 26 / planche 29 : écran sans bloc de données chargé à l'affichage (ni vide ni squelette) ;
// ses états sont ceux de la demande : saisie, envoi en cours, envoyé, refusé.

async function render(requestPasswordReset: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [PasswordResetPage],
    providers: [provideRouter([]), { provide: RegisterApi, useValue: { requestPasswordReset } }],
  });
  const fixture = TestBed.createComponent(PasswordResetPage);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function type(el: HTMLElement, value: string): void {
  const input = el.querySelector<HTMLInputElement>('input[type=email]');
  if (!input) throw new Error('champ e-mail absent');
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function submit(
  fixture: ComponentFixture<PasswordResetPage>,
  el: HTMLElement,
  email = 'claire@example.test',
): Promise<void> {
  type(el, email);
  el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
  await fixture.whenStable();
}

describe('PasswordResetPage', () => {
  it('saisie : formulaire étiqueté, aucun message', async () => {
    const { el } = await render(vi.fn());
    expect(el.querySelector('form')?.getAttribute('aria-labelledby')).toBe('reset-title');
    expect(el.querySelector('#reset-title')?.textContent).toContain('Mot de passe oublié');
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.querySelector('[role=status]')).toBeNull();
  });

  it('e-mail mal formé : rien n’est envoyé, message sous le champ', async () => {
    const request = vi.fn();
    const { fixture, el } = await render(request);
    await submit(fixture, el, 'pas-un-email');
    fixture.detectChanges();
    expect(request).not.toHaveBeenCalled();
    expect(el.querySelector('#reset-email-error')?.textContent).toContain("n'est pas valide");
    expect(el.querySelector('#reset-email')?.getAttribute('aria-describedby')).toBe(
      'reset-email-error',
    );
  });

  it('envoi en cours : bouton inactif ; envoyé : message role=status, formulaire conservé', async () => {
    let resolve!: () => void;
    const request = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { fixture, el } = await render(request);
    type(el, 'claire@example.test');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    fixture.detectChanges();
    expect(request).toHaveBeenCalledWith('claire@example.test');
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    resolve();
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    // Le formulaire reste en place (nouvelle demande possible, elle remplace le lien).
    expect(el.querySelector('form')).not.toBeNull();
    const sent = el.querySelector('[role=status]');
    expect(sent?.textContent).toContain('Si un compte existe pour cette adresse');
    expect(sent?.textContent).toContain('valable 30 minutes');
  });

  it('UX-D4 · textes de confiance : étape 1 sur 2, lien valable 30 minutes, même message, retour en haut', async () => {
    const { el } = await render(vi.fn());
    const card = el.querySelector('section.card');
    const first = card?.firstElementChild;
    expect(first?.querySelector('a')?.textContent).toContain('Retour à la connexion');
    expect(el.querySelector('.eyebrow')?.textContent).toContain('Étape 1 sur 2');
    expect(el.querySelector('.intro')?.textContent).toMatch(/valable\s+30 minutes/);
    expect(el.querySelector('.note')?.textContent).toContain(
      "le message est le même qu'un compte existe ou non",
    );
    expect(el.querySelector('label[for=reset-email]')?.textContent).toContain('Adresse e-mail');
  });

  it('422 : « Vérifiez l’adresse », role=alert, saisie conservée', async () => {
    const problem: ApiProblem = { status: 422, code: 'VALIDATION_FAILED' };
    const { fixture, el } = await render(vi.fn().mockRejectedValue(problem));
    await submit(fixture, el);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      "Vérifiez l'adresse e-mail saisie.",
    );
    expect(el.querySelector<HTMLInputElement>('input[type=email]')?.value).toBe(
      'claire@example.test',
    );
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });

  it.each([
    { status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 3600 },
    { status: 500, code: 'INTERNAL_ERROR' },
    { status: 0, code: 'NETWORK_ERROR' },
  ])('$status $code : message générique (fiche 26), on peut réessayer', async (problem) => {
    const request = vi.fn().mockRejectedValueOnce(problem).mockResolvedValueOnce(undefined);
    const { fixture, el } = await render(request);
    await submit(fixture, el);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Envoi impossible pour le moment. Réessayez dans un instant.',
    );
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(request).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role=status]')).not.toBeNull();
  });
});
