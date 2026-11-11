import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PublicLayoutComponent } from './public-layout.component';

@Component({
  selector: 'pm-public-host',
  imports: [PublicLayoutComponent],
  template: `
    <pm-public-layout
      [authenticated]="authenticated()"
      [narrow]="narrow()"
      [wide]="wide()"
      switchHref="/en/annuaire"
      switchLang="en"
    >
      <h1>Contenu</h1>
    </pm-public-layout>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly authenticated = input(false);
  readonly narrow = input(false);
  readonly wide = input(false);
}

async function render(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const fixture = TestBed.createComponent(Host);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PublicLayoutComponent', () => {
  it('bandeau, liens, Espace praticien vers /connexion, pied sans numéro d’urgence', async () => {
    const { el } = await render();
    expect(el.querySelector('header .brand-name')?.textContent).toBe('PsyMate');
    expect(el.querySelector('header .tagline')?.textContent).toBe('Annuaire des praticiens');
    const links = [...el.querySelectorAll<HTMLAnchorElement>('nav.links a')].map((a) => [
      a.getAttribute('href'),
      a.textContent?.trim(),
    ]);
    expect(links).toEqual([
      ['/annuaire', 'Annuaire'],
      ['/comment-ca-marche', 'Comment ça marche'],
    ]);
    expect(el.querySelector('a.practitioner')?.getAttribute('href')).toBe('/connexion');
    expect(el.querySelector('a.locale-switch')?.getAttribute('href')).toBe('/en/annuaire');
    expect(el.querySelector('main#main h1')?.textContent).toBe('Contenu');
    const footer = el.querySelector('footer');
    expect([...footer!.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/mentions-legales',
      '/confidentialite',
      '/accessibilite',
    ]);
    expect(footer?.textContent).not.toMatch(/3114|\b15\b/);
  });

  it('UX-A3 : liens autonomes du pied et de la langue en cible de 24 px (.pm-link-target)', async () => {
    const { el } = await render({ authenticated: false });
    const footerLinks = [...el.querySelectorAll('footer a')];
    expect(footerLinks).toHaveLength(3);
    for (const link of footerLinks) expect(link.classList).toContain('pm-link-target');
    expect(el.querySelector('a.locale-switch')?.classList).toContain('pm-link-target');
  });

  it('connecté : Espace praticien mène à /patients ; narrow : conteneur 480 px', async () => {
    const { el } = await render({ authenticated: true, narrow: true });
    expect(el.querySelector('a.practitioner')?.getAttribute('href')).toBe('/patients');
    expect(el.querySelector('main')?.classList.contains('narrow')).toBe(true);
  });

  it('UX-A8 : par défaut ni narrow ni wide (1 120 px) ; wide : contenu jusqu’à 1 280 px', async () => {
    const plain = await render();
    const main = plain.el.querySelector('main')!;
    expect(main.classList.contains('wide')).toBe(false);
    expect(main.classList.contains('narrow')).toBe(false);
    TestBed.resetTestingModule();

    const wide = await render({ wide: true });
    expect(wide.el.querySelector('main')?.classList.contains('wide')).toBe(true);
    TestBed.resetTestingModule();

    // narrow l'emporte : un formulaire reste à 480 px même sous une route large.
    const both = await render({ wide: true, narrow: true });
    const bothMain = both.el.querySelector('main')!;
    expect(bothMain.classList.contains('narrow')).toBe(true);
    expect(bothMain.classList.contains('wide')).toBe(false);
  });
});
