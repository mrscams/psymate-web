import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ContactMessage } from '../data/directory.models';
import { ContactFormComponent } from './contact-form.component';

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ContactFormComponent);
  fixture.componentRef.setInput('practitionerName', 'Claire Moreau');
  await fixture.whenStable();
  const sent: ContactMessage[] = [];
  fixture.componentInstance.send.subscribe((m) => sent.push(m));
  return { fixture, el: fixture.nativeElement as HTMLElement, sent };
}

function type(el: HTMLElement, selector: string, value: string): void {
  const field = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!field) throw new Error(`champ absent : ${selector}`);
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

function fill(el: HTMLElement): void {
  type(el, '#field-name', 'Sam Visiteur');
  type(el, '#field-email', 'sam@example.test');
  type(el, '#field-message', 'Bonjour, avez-vous des disponibilités ?');
}

describe('ContactFormComponent', () => {
  it('champs étiquetés, avertissement médical, piège à robots caché et hors tabulation', async () => {
    const { el } = await render();
    for (const label of ['Votre nom', 'Votre e-mail', 'Objet', 'Message']) {
      expect(el.textContent).toContain(label);
    }
    expect(el.textContent).toContain('Évitez les informations médicales détaillées');
    const trap = el.querySelector('.trap');
    expect(trap?.getAttribute('aria-hidden')).toBe('true');
    expect(trap?.querySelector('input')?.getAttribute('tabindex')).toBe('-1');
    expect(trap?.querySelector('input')?.getAttribute('autocomplete')).toBe('off');
  });

  it('consentement obligatoire : rien ne part sans la case, message sous la case', async () => {
    const { fixture, el, sent } = await render();
    fill(el);
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(sent).toHaveLength(0);
    expect(el.querySelector('#consent-error')?.textContent).toContain('Cochez cette case');
  });

  it('envoi : message, objet par défaut, piège vide, instant d’affichage', async () => {
    const { fixture, el, sent } = await render();
    const before = Date.now();
    fill(el);
    el.querySelector<HTMLInputElement>('#field-consent input')?.click();
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      name: 'Sam Visiteur',
      email: 'sam@example.test',
      subject: 'Demande de premier rendez-vous',
      consent: true,
      website: '',
    });
    expect(Date.parse(sent[0].formShownAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(sent[0].formShownAt)).toBeGreaterThan(before - 60_000);
  });

  it('422 : message du serveur sous le champ ; 429 : délai ; envoyé : confirmation', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('problem', {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'email', code: '', message: 'Adresse e-mail invalide (serveur).' }],
    });
    fixture.componentRef.setInput('status', 'invalid');
    await fixture.whenStable();
    expect(el.textContent).toContain('Adresse e-mail invalide (serveur).');

    fixture.componentRef.setInput('status', 'rate-limited');
    fixture.componentRef.setInput('retryAt', Date.now() + 20 * 60_000);
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/Réessayez dans 20 min/);

    fixture.componentRef.setInput('status', 'sent');
    await fixture.whenStable();
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Votre message a été transmis à Claire Moreau.',
    );
    expect(el.querySelector('form')).toBeNull();
  });
});
