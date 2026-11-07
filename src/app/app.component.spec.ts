import { APP_BASE_HREF } from '@angular/common';
import { Component, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { SessionStore } from './core/auth';
import { SessionApi } from './core/auth/data/session.api';
import { HttpNotices } from './core/http';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

const sessionApi = { logout: vi.fn().mockResolvedValue(undefined) };

async function render(locale: string, options: { signedIn?: boolean; url?: string } = {}) {
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([
        { path: 'connexion', component: Blank, data: { layout: 'public' } },
        { path: 'annuaire', component: Blank, data: { layout: 'public', wide: true } },
        { path: 'admin', component: Blank, data: { layout: 'admin' } },
        { path: '_demo', component: Blank, data: { layout: 'bare' } },
        { path: '**', component: Blank },
      ]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: APP_BASE_HREF, useValue: `/${locale}/` },
      { provide: SessionApi, useValue: sessionApi },
    ],
  });
  if (options.signedIn) {
    TestBed.inject(SessionStore).signIn({
      id: '1',
      email: 'claire@example.test',
      displayName: 'Claire Moreau',
      profession: 'psychologist',
      verificationStatus: 'under_review',
      role: 'practitioner',
      twoFactorEnabled: false,
      passwordChangeRequired: false,
    });
  }
  const fixture = TestBed.createComponent(AppComponent);
  await TestBed.inject(Router).navigateByUrl(options.url ?? '/patients');
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AppComponent', () => {
  beforeEach(() => {
    document.head.querySelector('base')?.remove();
  });
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    document.documentElement.removeAttribute('data-theme');
  });

  it('tourne sans zone.js (zoneless)', () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
  });

  it('habillage praticien : barre d’application, main, toasts, thème appliqué', async () => {
    const { el } = await render('fr');
    expect(el.querySelector('pm-app-bar header .brand-name')?.textContent).toBe('PsyMate');
    expect(el.querySelector('main#main router-outlet')).not.toBeNull();
    expect(el.querySelector('pm-toast-outlet')).not.toBeNull();
    expect(el.querySelector('pm-public-layout')).toBeNull();
    expect(el.querySelector('pm-verification-banner .banner')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
  });

  it('avec session : avatar, bandeau d’état tant que le dossier n’est pas approuvé, déconnexion', async () => {
    const { fixture, el } = await render('fr', { signedIn: true });
    expect(el.querySelector('pm-verification-banner .banner.warning')).not.toBeNull();
    const avatar = el.querySelector<HTMLButtonElement>('pm-app-bar button.avatar');
    expect(avatar?.querySelector('span:not(.sr-only)')?.textContent).toBe('CM');

    avatar?.click();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    document.querySelector<HTMLButtonElement>('.mat-mdc-menu-panel button.logout')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/connexion'));
    expect(sessionApi.logout).toHaveBeenCalled();
    expect(TestBed.inject(SessionStore).authenticated()).toBe(false);
  });

  it('habillage public sur /connexion : layout public étroit, sans barre d’application', async () => {
    const { el } = await render('fr', { url: '/connexion' });
    expect(el.querySelector('pm-public-layout main#main.narrow router-outlet')).not.toBeNull();
    expect(el.querySelector('pm-app-bar')).toBeNull();
    expect(el.querySelector('pm-verification-banner')).toBeNull();
  });

  it('habillage public large sur une route data.wide (annuaire) : pas de conteneur 480 px', async () => {
    const { el } = await render('fr', { url: '/annuaire' });
    expect(el.querySelector('pm-public-layout main#main router-outlet')).not.toBeNull();
    expect(el.querySelector('pm-public-layout main#main.narrow')).toBeNull();
  });

  it('habillage admin et habillage nu', async () => {
    const admin = await render('fr', { url: '/admin' });
    expect(admin.el.querySelector('pm-admin-bar')).not.toBeNull();
    expect(admin.el.querySelector('pm-app-bar')).toBeNull();
    TestBed.resetTestingModule();

    const bare = await render('fr', { url: '/_demo' });
    expect(bare.el.querySelector('pm-app-bar')).toBeNull();
    expect(bare.el.querySelector('pm-admin-bar')).toBeNull();
    expect(bare.el.querySelector('router-outlet')).not.toBeNull();
  });

  it('le bandeau réseau apparaît quel que soit l’habillage', async () => {
    const { fixture, el } = await render('fr', { url: '/connexion' });
    TestBed.inject(HttpNotices).wentOffline();
    await fixture.whenStable();
    expect(el.querySelector('pm-network-banner .banner')?.textContent).toContain(
      'Connexion perdue',
    );
  });

  it('en français, propose la même page en anglais', async () => {
    const base = document.createElement('base');
    base.href = '/fr/';
    document.head.append(base);

    const { el } = await render('fr', { url: '/patients' });
    const link = el.querySelector<HTMLAnchorElement>('a.locale-switch');
    expect(link?.getAttribute('href')).toBe('/en/patients');
    expect(link?.getAttribute('hreflang')).toBe('en');
    expect(link?.getAttribute('lang')).toBe('en');
  });

  it('en anglais, propose la même page en français', async () => {
    const base = document.createElement('base');
    base.href = '/en/';
    document.head.append(base);

    const { el } = await render('en-US', { url: '/connexion' });
    const link = el.querySelector<HTMLAnchorElement>('a.locale-switch');
    expect(link?.getAttribute('href')).toBe('/fr/connexion');
    expect(link?.getAttribute('hreflang')).toBe('fr');
  });
});
