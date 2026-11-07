import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppBarComponent, AppBarUser } from './app-bar.component';

@Component({
  selector: 'pm-app-bar-host',
  imports: [AppBarComponent],
  template: `
    <pm-app-bar
      [section]="section()"
      [crumb]="crumb()"
      [user]="user()"
      switchHref="/en/patients"
      switchLang="en"
      [showSearch]="showSearch()"
      (searchSubmit)="searched.emit($event)"
      (logout)="loggedOut.emit()"
    />
    <main id="main"><button>après</button></main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly section = input<string>();
  readonly crumb = input<string>();
  readonly user = input<AppBarUser | null>(null);
  readonly showSearch = input(true);
  readonly searched = output<string>();
  readonly loggedOut = output<void>();
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

describe('AppBarComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('sans session : logo PsyMate, lien d’évitement, langue, pas d’avatar', async () => {
    const { el } = await render();
    expect(el.querySelector('header .brand-name')?.textContent).toBe('PsyMate');
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
    const locale = el.querySelector<HTMLAnchorElement>('a.locale-switch');
    expect(locale?.getAttribute('href')).toBe('/en/patients');
    expect(locale?.getAttribute('hreflang')).toBe('en');
    expect(locale?.textContent).toBe('English');
    expect(el.querySelector('button.avatar')).toBeNull();
    expect(el.querySelector('header')?.querySelector('[role="search"]')).not.toBeNull();
  });

  it('section et fil d’Ariane', async () => {
    const { el } = await render({ section: 'Patients', crumb: 'Marie D.' });
    const section = el.querySelector('.section');
    expect(section?.textContent?.replace(/\s+/g, ' ')).toContain('Patients');
    expect(section?.querySelector('.crumb')?.textContent).toBe('Marie D.');
  });

  it('avec session : avatar aux initiales, menu Mon compte et Déconnexion', async () => {
    const { fixture, el } = await render({ user: { displayName: 'Claire Moreau' } });
    const avatar = el.querySelector<HTMLButtonElement>('button.avatar');
    expect(avatar?.querySelector('span:not(.sr-only)')?.textContent).toBe('CM');
    expect(avatar?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(
      /^CM ?· Claire Moreau, menu du compte$/,
    );

    const loggedOut = vi.fn();
    fixture.componentInstance.loggedOut.subscribe(loggedOut);
    avatar?.click();
    await fixture.whenStable();
    const menu = document.querySelector('.mat-mdc-menu-panel');
    expect(menu?.querySelector('a[mat-menu-item]')?.getAttribute('href')).toBe(
      '/mon-compte/profil-public',
    );
    menu?.querySelector<HTMLButtonElement>('button.logout')?.click();
    expect(loggedOut).toHaveBeenCalledOnce();
  });

  it('la touche / donne le focus au champ de recherche ; Entrée émet la requête', async () => {
    const { fixture, el } = await render();
    const searched = vi.fn();
    fixture.componentInstance.searched.subscribe(searched);
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(input);

    input.value = '  anxiété ';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(searched).toHaveBeenCalledWith('anxiété');
  });

  it('sans champ de recherche, la touche / ne fait rien', async () => {
    const { el } = await render({ showSearch: false });
    expect(el.querySelector('[role="search"]')).toBeNull();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
