import { DOCUMENT, PlatformLocation } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { LocaleNavigator } from './locale-navigator';

function setup(localeId: string, baseHref: string, url: string) {
  const assign = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: localeId },
      { provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } },
      { provide: PlatformLocation, useValue: { getBaseHrefFromDOM: () => baseHref } },
      { provide: Router, useValue: { url } },
    ],
  });
  return { navigator: TestBed.inject(LocaleNavigator), assign };
}

describe('LocaleNavigator', () => {
  it('mène vers la même route dans le bundle arabe (M16-08)', () => {
    const { navigator, assign } = setup('fr', '/fr/', '/patients?archived=true');
    expect(navigator.current).toBe('fr');
    navigator.goTo('ar');
    expect(assign).toHaveBeenCalledWith('/ar/patients?archived=true');
  });

  it('depuis le bundle arabe, revient au français ou à l’anglais', () => {
    const { navigator, assign } = setup('ar', '/ar/', '/compte');
    expect(navigator.current).toBe('ar');
    navigator.goTo('fr');
    expect(assign).toHaveBeenLastCalledWith('/fr/compte');
    navigator.goTo('en');
    expect(assign).toHaveBeenLastCalledWith('/en/compte');
  });

  it('ne recharge pas quand la langue demandée est déjà celle du bundle', () => {
    const { navigator, assign } = setup('ar', '/ar/', '/compte');
    navigator.goTo('ar');
    expect(assign).not.toHaveBeenCalled();
  });
});
