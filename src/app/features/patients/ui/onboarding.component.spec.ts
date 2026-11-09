import { TestBed } from '@angular/core/testing';

import { SubjectVocabulary } from '../../../core/i18n';
import { OnboardingComponent, OnboardingStep } from './onboarding.component';

function render(
  current: OnboardingStep = 1,
  hasDemo = false,
  label: 'patient' | 'client' = 'patient',
) {
  TestBed.inject(SubjectVocabulary).set(label);
  const fixture = TestBed.createComponent(OnboardingComponent);
  fixture.componentRef.setInput('current', current);
  fixture.componentRef.setInput('hasDemo', hasDemo);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const steps = [...el.querySelectorAll('ol > li')];
  return { fixture, el, steps };
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('OnboardingComponent (accueil de première connexion)', () => {
  it('titre, trois étapes, l’étape 1 en cours (aria-current, en toutes lettres)', () => {
    const { el, steps } = render(1);
    expect(text(el.querySelector('h2'))).toBe('Bienvenue dans PsyMate');
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe(
      el.querySelector('h2')?.id,
    );
    expect(steps).toHaveLength(3);
    expect(text(steps[0].querySelector('strong'))).toBe('Créez un patient');
    expect(text(steps[1].querySelector('strong'))).toBe('Ouvrez son dossier');
    expect(text(steps[2].querySelector('strong'))).toBe('Saisissez la première entrée');
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(text(steps[0])).toContain('Étape en cours');
    expect(steps[1].getAttribute('aria-current')).toBeNull();
    expect(text(steps[1])).not.toContain('Étape en cours');
  });

  it('étape 3 : les deux premières marquées « Fait »', () => {
    const { steps } = render(3);
    expect(text(steps[0])).toContain('Fait');
    expect(text(steps[1])).toContain('Fait');
    expect(steps[2].getAttribute('aria-current')).toBe('step');
  });

  it('coach : « Créez un client »', () => {
    const { steps } = render(1, false, 'client');
    expect(text(steps[0].querySelector('strong'))).toBe('Créez un client');
  });

  it('« Voir les raccourcis » : bouton avec la touche ?, émet showShortcuts', () => {
    const { fixture, el } = render();
    const emitted = vi.fn();
    fixture.componentInstance.showShortcuts.subscribe(emitted);
    const button = el.querySelector<HTMLButtonElement>('button.shortcuts');
    expect(text(button?.querySelector('span'))).toBe('Voir les raccourcis');
    expect(button?.getAttribute('aria-keyshortcuts')).toBe('?');
    button?.click();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('message préparé pour les suggestions (V2) : texte neutre seulement, aucune action', () => {
    const { el } = render();
    const soon = el.querySelector('.soon');
    expect(text(soon)).toMatch(/^Bientôt : des suggestions/);
    expect(text(soon)).toContain('vous seul déciderez');
    expect(soon?.querySelector('a, button')).toBeNull();
    expect(el.querySelectorAll('button')).toHaveLength(1);
  });

  it('patient de démonstration présent : invitation à l’explorer, sinon rien', () => {
    expect(render(1, true).el.querySelector('.demo')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(render(1, false).el.querySelector('.demo')).toBeNull();
  });
});
