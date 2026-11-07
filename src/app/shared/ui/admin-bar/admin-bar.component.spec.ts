import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminBarComponent } from './admin-bar.component';

async function render(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [AdminBarComponent],
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const fixture = TestBed.createComponent(AdminBarComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AdminBarComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  it('ADMIN, quatre onglets sans Signalements, rappel, compteur absent tant qu’inconnu', async () => {
    const { el } = await render();
    expect(el.querySelector('.tag')?.textContent).toBe('ADMIN');
    const tabs = [...el.querySelectorAll<HTMLAnchorElement>('nav.tabs a')].map((a) => [
      a.getAttribute('href'),
      a.textContent?.replace(/\s+/g, ' ').trim(),
    ]);
    expect(tabs).toEqual([
      ['/admin/validation', 'Validation'],
      ['/admin/praticiens', 'Praticiens'],
      ['/admin/journal', 'Journal'],
      ['/admin/vocabulaire', 'Vocabulaire'],
    ]);
    expect(el.textContent).not.toContain('Signalements');
    expect(el.querySelector('.reminder')?.textContent?.trim()).toBe(
      "Aucune donnée patient n'est accessible depuis l'administration.",
    );
    expect(el.querySelector('.count')).toBeNull();
    expect(el.querySelector('button.avatar')).toBeNull();
  });

  it('compteur de validation et menu de déconnexion', async () => {
    const { fixture, el } = await render({ pendingCount: 6, user: { displayName: 'Hugo Admin' } });
    expect(el.querySelector('.count')?.textContent).toBe('6');
    const avatar = el.querySelector<HTMLButtonElement>('button.avatar');
    expect(avatar?.querySelector('span:not(.sr-only)')?.textContent).toBe('HA');
    const logout = vi.fn();
    fixture.componentInstance.logout.subscribe(logout);
    avatar?.click();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('.mat-mdc-menu-panel button.logout')?.click();
    expect(logout).toHaveBeenCalledOnce();
  });
});
