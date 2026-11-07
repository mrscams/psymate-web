import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AccountNavComponent, verificationBadge } from './account-nav.component';

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [AccountNavComponent],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const fixture = TestBed.createComponent(AccountNavComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AccountNavComponent', () => {
  it('six entrées dans l’ordre de la fiche, nom et profession', async () => {
    const { el } = await render({ name: 'Claire Moreau', subtitle: 'Psychologue · Lyon' });
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Mon compte');
    expect(el.querySelector('.name')?.textContent).toBe('Claire Moreau');
    expect(el.querySelector('.subtitle')?.textContent).toBe('Psychologue · Lyon');
    const entries = [...el.querySelectorAll<HTMLAnchorElement>('li a')].map((a) => [
      a.getAttribute('href'),
      a.querySelector('.label')?.textContent,
    ]);
    expect(entries).toEqual([
      ['/mon-compte/profil-public', 'Profil public'],
      ['/mon-compte/preferences', 'Préférences'],
      ['/mon-compte/emotions', 'Émotions personnalisées'],
      ['/mon-compte/dossier-professionnel', 'Dossier professionnel'],
      ['/mon-compte/securite', 'Compte et sécurité'],
      ['/mon-compte/donnees', 'Données et export'],
    ]);
    expect(el.querySelectorAll('.badge')).toHaveLength(0);
  });

  it('pastilles publié et état du dossier', async () => {
    const { el, fixture } = await render({
      name: 'Claire',
      published: true,
      verificationStatus: 'under_review',
    });
    const badges = [...el.querySelectorAll('.badge')].map((b) => [b.textContent, b.className]);
    expect(badges).toEqual([
      ['publié', 'badge success'],
      ['en attente', 'badge warning'],
    ]);
    fixture.componentRef.setInput('verificationStatus', 'approved');
    await fixture.whenStable();
    expect(el.querySelectorAll('.badge')[1].textContent).toBe('approuvé');
    expect(verificationBadge('needs_more')?.text).toBe('complément demandé');
    expect(verificationBadge('rejected')).toBeNull();
  });

  it('aria-current sur l’entrée de la route courante', async () => {
    const { el, fixture } = await render({ name: 'Claire' });
    await TestBed.inject(Router).navigateByUrl('/mon-compte/preferences');
    await fixture.whenStable();
    const active = el.querySelector('a[aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('/mon-compte/preferences');
    expect(active?.classList.contains('active')).toBe(true);
  });
});
