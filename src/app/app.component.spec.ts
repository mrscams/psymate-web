import { APP_BASE_HREF } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { SessionStore } from './core/auth';
import { SessionApi } from './core/auth/data/session.api';

const sessionApi = { logout: vi.fn().mockResolvedValue(undefined) };

async function render(locale: string, signedIn = false): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: APP_BASE_HREF, useValue: `/${locale}/` },
      { provide: SessionApi, useValue: sessionApi },
    ],
  });
  if (signedIn) {
    TestBed.inject(SessionStore).signIn({
      id: '1',
      email: 'claire@example.test',
      displayName: 'Claire',
      profession: 'psychologist',
      verificationStatus: 'approved',
      role: 'practitioner',
      twoFactorEnabled: false,
      passwordChangeRequired: false,
    });
  }
  const fixture = TestBed.createComponent(AppComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('AppComponent', () => {
  beforeEach(() => {
    document.head.querySelector('base')?.remove();
  });

  it('tourne sans zone.js (zoneless)', () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
  });

  it('affiche l’en-tête et le repère main des routes', async () => {
    const el = await render('fr');
    expect(el.querySelector('header .brand')?.textContent).toContain('PsyMate');
    expect(el.querySelector('header nav')).not.toBeNull();
    expect(el.querySelector('main router-outlet')).not.toBeNull();
  });

  it('bouton de déconnexion provisoire seulement avec une session', async () => {
    expect((await render('fr')).querySelector('button.logout')).toBeNull();
    TestBed.resetTestingModule();
    const el = await render('fr', true);
    const button = el.querySelector<HTMLButtonElement>('button.logout');
    expect(button?.textContent).toContain('Se déconnecter');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/connexion'));
    expect(sessionApi.logout).toHaveBeenCalled();
    expect(TestBed.inject(SessionStore).authenticated()).toBe(false);
  });

  it('en français, propose la même page en anglais', async () => {
    const base = document.createElement('base');
    base.href = '/fr/';
    document.head.append(base);

    const link = (await render('fr')).querySelector<HTMLAnchorElement>('a.locale-switch');
    expect(link?.getAttribute('href')).toBe('/en/');
    expect(link?.getAttribute('hreflang')).toBe('en');
    expect(link?.getAttribute('lang')).toBe('en');
  });

  it('en anglais, propose la même page en français', async () => {
    const base = document.createElement('base');
    base.href = '/en/';
    document.head.append(base);

    const link = (await render('en-US')).querySelector<HTMLAnchorElement>('a.locale-switch');
    expect(link?.getAttribute('href')).toBe('/fr/');
    expect(link?.getAttribute('hreflang')).toBe('fr');
  });
});
