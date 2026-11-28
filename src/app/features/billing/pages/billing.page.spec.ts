import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ShortcutService } from '../../../core/shortcuts';
import { BILLING_ROUTES } from '../index';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

async function render(url = '/facturation') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'facturation', children: BILLING_ROUTES },
        { path: 'patients', component: Blank },
      ]),
      // Aucun appel d'API dans le socle : le contrôleur le vérifie à la fin de chaque test.
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  const router = TestBed.inject(Router);
  const el = harness.fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.fixture.whenStable();
  };
  const tab = (label: string) =>
    [...el.querySelectorAll<HTMLAnchorElement>('nav.tabs a')].find(
      (a) => a.textContent?.trim() === label,
    )!;
  return { harness, router, el, settle, tab };
}

describe('BillingPage et BILLING_ROUTES (socle du module Facturation)', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('/facturation : en-tête de module, onglet Factures courant, page à l’état chargement', async () => {
    const { el, tab } = await render();
    expect(el.querySelector('pm-billing-header h1')?.textContent?.trim()).toBe('Facturation');
    expect(tab('Factures').getAttribute('aria-current')).toBe('page');
    const state = el.querySelector('pm-invoices-page pm-state [aria-busy="true"]');
    expect(state).not.toBeNull();
    expect(el.querySelector('a.new')?.getAttribute('href')).toBe('/facturation/nouvelle');
  });

  it('les quatre onglets naviguent, chacun vers sa page à l’état chargement', async () => {
    const { el, router, settle, tab } = await render();
    const cases: [string, string, string][] = [
      ['À facturer', '/facturation/a-facturer', 'pm-billable-page'],
      ['Paiements', '/facturation/paiements', 'pm-payments-page'],
      ['Réglages', '/facturation/reglages', 'pm-billing-settings-page'],
      ['Factures', '/facturation', 'pm-invoices-page'],
    ];
    for (const [label, url, page] of cases) {
      tab(label).click();
      await settle();
      expect(router.url).toBe(url);
      expect(tab(label).getAttribute('aria-current')).toBe('page');
      expect(el.querySelector(`${page} pm-state [aria-busy="true"]`)).not.toBeNull();
      // Une seule page d'onglet à la fois sous l'en-tête, rendu une seule fois.
      expect(el.querySelectorAll('pm-billing-header')).toHaveLength(1);
    }
  });

  it('titres d’onglet du navigateur par page', async () => {
    const { harness } = await render('/facturation/paiements');
    expect(document.title).toBe('Paiements · Facturation · PsyMate');
    await harness.navigateByUrl('/facturation');
    expect(document.title).toBe('Facturation · PsyMate');
    await harness.navigateByUrl('/facturation/nouvelle');
    expect(document.title).toBe('Nouvelle facture · PsyMate');
  });

  it('N ouvre /facturation/nouvelle : l’éditeur, sans l’en-tête de module', async () => {
    const { router, el, settle } = await render('/facturation/a-facturer');
    const event = press('n');
    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(router.url).toBe('/facturation/nouvelle');
    expect(el.querySelector('pm-billing-header')).toBeNull();
    expect(el.querySelector('pm-new-invoice-page h1')?.textContent?.trim()).toBe(
      'Nouvelle facture',
    );
    expect(el.querySelector('pm-new-invoice-page a.back')?.getAttribute('href')).toBe(
      '/facturation',
    );
    expect(el.querySelector('pm-new-invoice-page pm-state [aria-busy="true"]')).not.toBeNull();
  });

  it('N est inactif dans un champ', async () => {
    const { router } = await render();
    const input = document.body.appendChild(document.createElement('input'));
    press('n', input);
    expect(router.url).toBe('/facturation');
    input.remove();
  });

  it('Réglages : ni bouton « Nouvelle facture » ni touche N ; revenir sur un autre onglet les rend', async () => {
    const { router, el, settle, tab } = await render('/facturation/reglages');
    expect(el.querySelector('a.new')).toBeNull();
    expect(press('n').defaultPrevented).toBe(false);
    await settle();
    expect(router.url).toBe('/facturation/reglages');
    expect(
      TestBed.inject(ShortcutService)
        .active()
        .map((r) => r.key),
    ).not.toContain('n');

    tab('Paiements').click();
    await settle();
    expect(el.querySelector('a.new')).not.toBeNull();
    expect(
      TestBed.inject(ShortcutService)
        .active()
        .map((r) => r.key),
    ).toContain('n');
  });

  it('quitter le module désinscrit la touche N', async () => {
    const { harness } = await render();
    expect(
      TestBed.inject(ShortcutService)
        .active()
        .map((r) => r.key),
    ).toContain('n');
    await harness.navigateByUrl('/patients');
    expect(
      TestBed.inject(ShortcutService)
        .active()
        .map((r) => r.key),
    ).not.toContain('n');
  });
});
