import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { BillingHeaderComponent, billingTabs, NEW_INVOICE_URL } from './billing-header.component';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

async function render(url = '/facturation', inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [BillingHeaderComponent],
    providers: [
      provideRouter([
        { path: 'facturation', component: Blank },
        { path: 'facturation/:tab', component: Blank },
        { path: 'patients', component: Blank },
      ]),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(BillingHeaderComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const tabs = () => [...el.querySelectorAll<HTMLAnchorElement>('nav.tabs a')];
  const current = () => tabs().filter((a) => a.getAttribute('aria-current') === 'page');
  return { fixture, el, tabs, current };
}

describe('BillingHeaderComponent (en-tête du module Facturation)', () => {
  it('titre « Facturation », quatre onglets dans l’ordre de la fiche 33, Réglages au bout', async () => {
    const { el, tabs } = await render();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Facturation');
    const nav = el.querySelector('nav.tabs')!;
    expect(nav.getAttribute('aria-label')).toBe('Facturation');
    expect(tabs().map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Factures', '/facturation'],
      ['À facturer', '/facturation/a-facturer'],
      ['Paiements', '/facturation/paiements'],
      ['Réglages', '/facturation/reglages'],
    ]);
    expect(tabs().map((a) => a.classList.contains('end'))).toEqual([false, false, false, true]);
    expect(billingTabs().map((tab) => tab.key)).toEqual([
      'invoices',
      'billable',
      'payments',
      'settings',
    ]);
  });

  it('« Nouvelle facture » : lien plein vers /facturation/nouvelle, touche N annoncée', async () => {
    const { el } = await render();
    const create = el.querySelector<HTMLAnchorElement>('a.new')!;
    expect(create.getAttribute('href')).toBe(NEW_INVOICE_URL);
    expect(NEW_INVOICE_URL).toBe('/facturation/nouvelle');
    expect(create.textContent).toContain('Nouvelle facture');
    expect(create.getAttribute('aria-keyshortcuts')).toBe('N');
    expect(create.querySelector('kbd')?.textContent).toBe('N');
    expect(create.querySelector('kbd')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sans « Nouvelle facture » quand showCreate est faux (Réglages)', async () => {
    const { el } = await render('/facturation/reglages', { showCreate: false });
    expect(el.querySelector('a.new')).toBeNull();
    expect(el.textContent).not.toContain('Nouvelle facture');
  });

  it('onglet courant selon la route, aria-current="page" sur lui seul', async () => {
    const { fixture, current } = await render('/facturation');
    expect(current().map((a) => a.textContent?.trim())).toEqual(['Factures']);
    expect(current()[0].classList.contains('active')).toBe(true);

    const cases: [string, string][] = [
      ['/facturation?statut=late&patient=p-1', 'Factures'],
      ['/facturation/a-facturer', 'À facturer'],
      ['/facturation/paiements', 'Paiements'],
      ['/facturation/reglages', 'Réglages'],
    ];
    for (const [url, label] of cases) {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
      expect(current().map((a) => a.textContent?.trim())).toEqual([label]);
    }

    await TestBed.inject(Router).navigateByUrl('/patients');
    await fixture.whenStable();
    expect(current()).toHaveLength(0);
  });

  it('compteur de « À facturer » seulement s’il est supérieur à zéro', async () => {
    const { fixture, el, tabs } = await render();
    expect(el.querySelector('.badge')).toBeNull();

    fixture.componentRef.setInput('billableCount', 0);
    await fixture.whenStable();
    expect(el.querySelector('.badge')).toBeNull();

    fixture.componentRef.setInput('billableCount', 7);
    await fixture.whenStable();
    const badges = el.querySelectorAll('.badge');
    expect(badges).toHaveLength(1);
    expect(tabs()[1].querySelector('.badge')?.textContent).toBe('7');
  });
});
