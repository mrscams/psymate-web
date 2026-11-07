import { APP_BASE_HREF } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

async function render(locale: string): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: APP_BASE_HREF, useValue: `/${locale}/` },
    ],
  });
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

  it('affiche la page vide avec un titre et un repère main', async () => {
    const el = await render('fr');
    expect(el.querySelector('main h1')?.textContent).toContain('PsyMate');
    expect(el.querySelector('header nav')).not.toBeNull();
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
