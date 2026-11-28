import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { NavDrawerService } from './nav-drawer.service';
import { NavRailComponent, navRailEntries } from './nav-rail.component';
import type { NavRailEntry } from './nav-rail.component';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const ctrlB = (target: EventTarget = document.body) => key(target, { key: 'b', ctrlKey: true });

function pointer(target: Element, type: 'pointerenter' | 'pointerleave', pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: false });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

async function render(url = '/patients') {
  TestBed.configureTestingModule({
    imports: [NavRailComponent],
    providers: [
      provideRouter([
        { path: 'patients', component: Blank },
        { path: 'patients/:id', component: Blank },
        { path: 'mon-compte', component: Blank },
        { path: 'facturation', component: Blank },
        { path: 'facturation/:tab', component: Blank },
      ]),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(NavRailComponent);
  document.body.append(fixture.nativeElement);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const rail = el.querySelector<HTMLElement>('nav.rail')!;
  return {
    fixture,
    el,
    rail,
    labels: () => [...el.querySelectorAll<HTMLElement>('.label')],
    patients: el.querySelector<HTMLAnchorElement>('a.item')!,
  };
}

describe('NavRailComponent (rail)', () => {
  let outside: HTMLButtonElement;

  beforeEach(() => {
    outside = document.body.appendChild(document.createElement('button'));
    outside.textContent = 'Enregistrer';
  });
  afterEach(() => {
    outside.remove();
    document.querySelectorAll('pm-nav-rail').forEach((n) => n.remove());
  });

  it('trois entrées liées : Patients, Agenda et Facture (M15-14), libellé « Facture » inchangé', async () => {
    expect(navRailEntries().map((entry) => [entry.key, entry.label, entry.route])).toEqual([
      ['patients', 'Patients', '/patients'],
      ['agenda', 'Agenda', '/agenda'],
      ['invoice', 'Facture', '/facturation'],
    ]);
    const { el, rail } = await render();
    expect(rail.getAttribute('aria-label')).toBe('Navigation');
    expect(el.querySelectorAll('.item')).toHaveLength(3);
    expect([...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))).toEqual([
      '/patients',
      '/agenda',
      '/facturation',
    ]);
    expect(el.querySelectorAll('.item.later')).toHaveLength(0);
    expect(el.querySelector('small')).toBeNull();
    const invoice = el.querySelector<HTMLAnchorElement>('a[href="/facturation"]')!;
    expect(invoice.getAttribute('aria-label')).toBe('Facture');
    expect(invoice.getAttribute('title')).toBe('Facture');
    expect(el.querySelectorAll('svg.ico')).toHaveLength(3);
  });

  it('une entrée sans route reste « à réaliser » : sans lien, aria-disabled, nom accessible', async () => {
    TestBed.configureTestingModule({
      imports: [NavRailComponent],
      providers: [provideRouter([{ path: 'patients', component: Blank }])],
    });
    const fixture = TestBed.createComponent(NavRailComponent);
    // Avant le premier rendu : la liste du composant reçoit une entrée sans route.
    (fixture.componentInstance as unknown as { entries: NavRailEntry[] }).entries = [
      { key: 'later', label: 'Plus tard', icon: 'invoice', route: null },
    ];
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const later = el.querySelector<HTMLElement>('.item.later')!;
    expect(later.tagName).toBe('SPAN');
    expect(later.getAttribute('aria-disabled')).toBe('true');
    expect(later.getAttribute('role')).toBe('link');
    expect(later.hasAttribute('href')).toBe(false);
    expect(later.hasAttribute('tabindex')).toBe(false);
    expect(later.getAttribute('aria-label')).toBe('Plus tard, à réaliser');
    expect(later.getAttribute('title')).toBe('Plus tard, à réaliser');
    expect(later.querySelector('small')?.textContent).toBe('à réaliser');
  });

  it('replié par défaut : 56 px, libellés masqués, nom accessible et infobulle sur chaque carreau', async () => {
    const { rail, labels, patients } = await render();
    expect(rail.classList.contains('expanded')).toBe(false);
    expect(getComputedStyle(rail).width).toBe('56px');
    for (const label of labels()) expect(getComputedStyle(label).display).toBe('none');
    expect(patients.getAttribute('aria-label')).toBe('Patients');
    expect(patients.getAttribute('title')).toBe('Patients');
  });

  it('carreau actif selon la route : /patients et /patients/**, pas ailleurs', async () => {
    const { fixture, patients } = await render('/patients/42');
    expect(patients.classList.contains('active')).toBe(true);
    expect(patients.getAttribute('aria-current')).toBe('page');

    await TestBed.inject(Router).navigateByUrl('/mon-compte');
    await fixture.whenStable();
    expect(patients.classList.contains('active')).toBe(false);
    expect(patients.hasAttribute('aria-current')).toBe(false);
  });

  it('Facture actif sur /facturation et /facturation/** (requête comprise), aria-current="page"', async () => {
    const { fixture, el, patients } = await render('/facturation');
    const invoice = el.querySelector<HTMLAnchorElement>('a[href="/facturation"]')!;
    expect(invoice.classList.contains('active')).toBe(true);
    expect(invoice.getAttribute('aria-current')).toBe('page');
    expect(patients.hasAttribute('aria-current')).toBe(false);

    for (const url of [
      '/facturation/a-facturer',
      '/facturation/reglages',
      '/facturation?statut=late',
    ]) {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
      expect(invoice.getAttribute('aria-current')).toBe('page');
    }

    await TestBed.inject(Router).navigateByUrl('/patients');
    await fixture.whenStable();
    expect(invoice.classList.contains('active')).toBe(false);
    expect(invoice.hasAttribute('aria-current')).toBe(false);
  });

  it('au survol : déplié à 220 px avec les libellés ; replié quand le pointeur sort', async () => {
    const { fixture, el, rail, labels } = await render();
    pointer(el, 'pointerenter');
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(true);
    expect(getComputedStyle(rail).width).toBe('220px');
    for (const label of labels()) expect(getComputedStyle(label).display).toBe('inline');

    pointer(el, 'pointerleave');
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(false);
  });

  it('un clic sur un carreau lui donne le focus sans déplier le rail', async () => {
    const { fixture, rail, patients } = await render();
    patients.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    patients.focus();
    await fixture.whenStable();
    expect(document.activeElement).toBe(patients);
    expect(rail.classList.contains('expanded')).toBe(false);
  });

  it('un toucher ne déplie pas (pas de survol au doigt)', async () => {
    const { fixture, el, rail } = await render();
    pointer(el, 'pointerenter', 'touch');
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(false);
  });

  it('au focus : libellés visibles ; replié quand le focus sort', async () => {
    const { fixture, rail, labels, patients } = await render();
    patients.focus();
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(true);
    for (const label of labels()) expect(getComputedStyle(label).display).toBe('inline');

    outside.focus();
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(false);
    for (const label of labels()) expect(getComputedStyle(label).display).toBe('none');
  });

  it('Ctrl+B : focus sur le carreau actif, déplié ; Échap replie et rend le focus', async () => {
    const { fixture, rail, patients } = await render('/patients/7');
    outside.focus();

    const shortcut = ctrlB(outside);
    await fixture.whenStable();
    expect(shortcut.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(patients);
    expect(rail.classList.contains('expanded')).toBe(true);

    const escape = key(patients, { key: 'Escape' });
    await fixture.whenStable();
    expect(escape.defaultPrevented).toBe(true);
    expect(rail.classList.contains('expanded')).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('Ctrl+B dans le rail le replie ; ⌘+B (Mac) répond aussi', async () => {
    const { fixture, rail, patients } = await render();
    outside.focus();
    key(outside, { key: 'b', metaKey: true });
    await fixture.whenStable();
    expect(document.activeElement).toBe(patients);

    ctrlB(patients);
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('Échap sous le pointeur : replié jusqu’à ce que le pointeur sorte', async () => {
    const { fixture, el, rail, patients } = await render();
    pointer(el, 'pointerenter');
    patients.focus();
    key(patients, { key: 'Escape' });
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(false);

    pointer(el, 'pointerleave');
    pointer(el, 'pointerenter');
    await fixture.whenStable();
    expect(rail.classList.contains('expanded')).toBe(true);
  });

  it('rail masqué (sous 900 px) : Ctrl+B demande le tiroir', async () => {
    const { fixture, el } = await render();
    const requested = vi.fn();
    fixture.componentRef.instance.drawerRequested.subscribe(requested);
    el.style.display = 'none';
    ctrlB();
    expect(requested).toHaveBeenCalledOnce();
  });
});

describe('NavDrawerService (tiroir sous 900 px)', () => {
  let trigger: HTMLButtonElement;
  let service: NavDrawerService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'patients', component: Blank }])],
    });
    await TestBed.inject(Router).navigateByUrl('/patients');
    service = TestBed.inject(NavDrawerService);
    trigger = document.body.appendChild(document.createElement('button'));
    trigger.textContent = '☰';
    trigger.focus();
  });
  afterEach(async () => {
    service.close();
    await tick();
    trigger.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

  async function openDrawer(): Promise<HTMLElement> {
    service.open();
    await tick();
    await tick();
    expect(service.isOpen()).toBe(true);
    return dialog()!;
  }

  it('dialogue modal de 280 px, libellés d’emblée, focus sur Patients', async () => {
    const drawer = await openDrawer();
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-label')).toBe('Navigation');
    expect(document.querySelector('.pm-nav-drawer-pane')).not.toBeNull();
    const rail = drawer.querySelector<HTMLElement>('nav.rail.drawer')!;
    expect(rail.classList.contains('expanded')).toBe(true);
    for (const label of drawer.querySelectorAll('.label')) {
      expect(getComputedStyle(label).display).toBe('inline');
    }
    expect(drawer.querySelectorAll('.item')).toHaveLength(3);
    expect(document.activeElement).toBe(drawer.querySelector('a.item'));
  });

  it('✕ ferme et rend le focus au bouton ☰', async () => {
    const drawer = await openDrawer();
    drawer.querySelector<HTMLButtonElement>('button.close')!.click();
    await tick();
    await tick();
    expect(dialog()).toBeNull();
    expect(service.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('Échap et clic sur le voile ferment ; toggle ouvre puis ferme', async () => {
    const drawer = await openDrawer();
    key(drawer, { key: 'Escape', keyCode: 27 } as KeyboardEventInit);
    await tick();
    await tick();
    expect(service.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);

    await openDrawer();
    document.querySelector<HTMLElement>('.pm-nav-drawer-veil')!.click();
    await tick();
    expect(service.isOpen()).toBe(false);

    service.toggle();
    await tick();
    expect(service.isOpen()).toBe(true);
    service.toggle();
    await tick();
    expect(service.isOpen()).toBe(false);
  });

  it('un clic sur un carreau ferme le tiroir ; Ctrl+B n’est pas inscrit par le tiroir', async () => {
    const drawer = await openDrawer();
    const handled = ctrlB();
    expect(handled.defaultPrevented).toBe(false);
    drawer.querySelector<HTMLAnchorElement>('a.item')!.click();
    await tick();
    expect(service.isOpen()).toBe(false);
  });
});
