import { APP_BASE_HREF } from '@angular/common';
import { Component, inject, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router, withComponentInputBinding } from '@angular/router';

import { AppComponent } from './app.component';
import { SessionStore } from './core/auth';
import { SessionApi } from './core/auth/data/session.api';
import { HttpNotices } from './core/http';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

/** Créations de pages (UX-A10) : chaque instance inscrit le chemin de sa route. */
const created: string[] = [];

@Component({ selector: 'pm-counted', template: '<h1>Page</h1>' })
class Counted {
  constructor() {
    const route = inject(ActivatedRoute).snapshot;
    created.push(route.pathFromRoot.map((r) => r.routeConfig?.path ?? '').join('/'));
  }
}

const sessionApi = { logout: vi.fn().mockResolvedValue(undefined) };

async function render(
  locale: string,
  options: { signedIn?: boolean; url?: string; firstRender?: boolean } = {},
) {
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter(
        [
          { path: 'connexion', component: Blank, data: { layout: 'public' } },
          { path: 'c/public', component: Counted, data: { layout: 'public' } },
          {
            path: 'c/admin',
            data: { layout: 'admin', contentWidth: 'wide' },
            children: [{ path: '', component: Counted }],
          },
          { path: 'c/bare', component: Counted, data: { layout: 'bare' } },
          { path: 'c/practitioner', component: Counted },
          { path: 'annuaire', component: Blank, data: { layout: 'public', wide: true } },
          { path: 'admin', component: Blank, data: { layout: 'admin' } },
          {
            path: 'admin-large',
            data: { layout: 'admin', contentWidth: 'wide' },
            children: [{ path: '', component: Blank }],
          },
          {
            path: 'annuaire-large',
            component: Blank,
            data: { layout: 'public', contentWidth: 'wide' },
          },
          { path: '_demo', component: Blank, data: { layout: 'bare' } },
          { path: '**', component: Blank },
        ],
        withComponentInputBinding(),
      ),
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
  // Ouverture directe : la coquille se rend une première fois avant la fin de la première
  // navigation, comme au démarrage de l'application (navigation initiale non bloquante).
  if (options.firstRender) await fixture.whenStable();
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
    expect(tags(el)).toEqual([
      'pm-app-bar',
      'pm-network-banner',
      'main',
      'pm-shortcuts-help',
      'pm-toast-outlet',
    ]);
    expect(el.querySelector('main#main')?.className).toBe('app-main');
    expect(el.querySelector('pm-app-bar header .brand-name')?.textContent).toBe('PsyMate');
    expect(el.querySelector('main#main router-outlet')).not.toBeNull();
    expect(el.querySelector('pm-toast-outlet')).not.toBeNull();
    expect(el.querySelector('pm-public-header')).toBeNull();
    expect(el.querySelector('pm-public-footer')).toBeNull();
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
    // Bandeau public (lien d'évitement compris), <main> étroit avec le bandeau réseau, pied.
    expect(tags(el)).toEqual(['pm-public-header', 'main', 'pm-public-footer', 'pm-toast-outlet']);
    expect(el.querySelector('pm-public-header a.skip-link[href="#main"]')).not.toBeNull();
    expect(el.querySelector('pm-public-header header .tagline')?.textContent).toBe(
      'Annuaire des praticiens',
    );
    const main = el.querySelector('main#main')!;
    expect(main.className).toBe('public-main narrow');
    expect(tags(main)).toEqual(['pm-network-banner', 'router-outlet', 'pm-blank']);
    expect(el.querySelectorAll('pm-public-footer footer nav a')).toHaveLength(3);
    expect(el.querySelector('pm-app-bar')).toBeNull();
    expect(el.querySelector('pm-verification-banner')).toBeNull();
    expect(el.querySelector('pm-shortcuts-help')).toBeNull();
  });

  it('habillage public large sur une route data.wide (annuaire) : pas de conteneur 480 px', async () => {
    const { el } = await render('fr', { url: '/annuaire' });
    expect(el.querySelector('main#main.public-main router-outlet')).not.toBeNull();
    expect(el.querySelector('main#main.narrow')).toBeNull();
  });

  it('habillage admin et habillage nu', async () => {
    const admin = await render('fr', { url: '/admin' });
    expect(admin.el.querySelector('pm-admin-bar')).not.toBeNull();
    expect(admin.el.querySelector('pm-app-bar')).toBeNull();
    expect(tags(admin.el)).toEqual([
      'pm-admin-bar',
      'pm-network-banner',
      'main',
      'pm-toast-outlet',
    ]);
    expect(admin.el.querySelector('main#main')?.className).toBe('app-main admin');
    expect(admin.el.querySelector('main#main router-outlet')).not.toBeNull();
    TestBed.resetTestingModule();

    const bare = await render('fr', { url: '/_demo' });
    expect(bare.el.querySelector('pm-app-bar')).toBeNull();
    expect(bare.el.querySelector('pm-admin-bar')).toBeNull();
    // Habillage nu : le même <main id="main">, sans classe ni marge ; la page n'en pose pas d'autre.
    expect(tags(bare.el)).toEqual(['pm-network-banner', 'main', 'pm-toast-outlet']);
    const bareMain = bare.el.querySelector('main#main')!;
    expect(bareMain.className).toBe('');
    expect(tags(bareMain)).toEqual(['router-outlet', 'pm-blank']);
    expect(['0', '0px']).toContain(getComputedStyle(bareMain).paddingTop);
  });

  it('UX-A8 : sans data.contentWidth, aucun main large (rendu inchangé)', async () => {
    const practitioner = await render('fr');
    expect(practitioner.el.querySelector('main#main.app-main.wide')).toBeNull();
    TestBed.resetTestingModule();

    const admin = await render('fr', { url: '/admin' });
    expect(admin.el.querySelector('main#main.app-main.admin')).not.toBeNull();
    expect(admin.el.querySelector('main#main.wide')).toBeNull();
    TestBed.resetTestingModule();

    const directory = await render('fr', { url: '/annuaire' });
    expect(directory.el.querySelector('main#main.public-main')).not.toBeNull();
    expect(directory.el.querySelector('main#main.wide')).toBeNull();
  });

  it('UX-A8 : data.contentWidth wide, hérité du parent : main admin large, annuaire à 1 280 px', async () => {
    const admin = await render('fr', { url: '/admin-large' });
    expect(admin.el.querySelector('main#main.app-main.admin.wide')).not.toBeNull();
    TestBed.resetTestingModule();

    const directory = await render('fr', { url: '/annuaire-large' });
    const main = directory.el.querySelector('main#main.public-main')!;
    expect(main.classList.contains('wide')).toBe(true);
    expect(main.classList.contains('narrow')).toBe(false);
    // Mêmes règles que le <main> de pm-public-layout (_public-main.scss) : 1 280 px de contenu.
    expect(getComputedStyle(main).getPropertyValue('--public-main-inline').trim()).toBe('24px');
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

  describe('UX-A10 : la page n’est créée qu’une fois', () => {
    const LAYOUTS = ['public', 'admin', 'bare', 'practitioner'] as const;
    /** Chemin enregistré par `Counted` (la route admin porte la page sur un enfant ''). */
    const pathOf = (layout: string) => (layout === 'admin' ? '/c/admin/' : `/c/${layout}`);

    beforeEach(() => (created.length = 0));

    for (const layout of LAYOUTS) {
      it(`ouverture directe d’une route ${layout} : une seule création, dans son habillage`, async () => {
        const { el } = await render('fr', { url: `/c/${layout}`, firstRender: true });
        expect(created).toEqual([pathOf(layout)]);
        expect(el.querySelectorAll('pm-counted')).toHaveLength(1);
        expect(el.querySelectorAll('router-outlet')).toHaveLength(1);
        expect(el.querySelectorAll('main')).toHaveLength(1);
        expect(el.querySelector('main#main pm-counted')).not.toBeNull();
      });
    }

    // Les 12 transitions, habillage nu compris (connexion en deux panneaux ↔ liste des patients).
    for (const from of LAYOUTS) {
      for (const to of LAYOUTS.filter((layout) => layout !== from)) {
        it(`navigation interne ${from} → ${to} : la page de destination est créée une fois`, async () => {
          const { fixture, el } = await render('fr', { url: `/c/${from}`, firstRender: true });
          const main = el.querySelector('main#main');
          created.length = 0;

          await TestBed.inject(Router).navigateByUrl(`/c/${to}`);
          await fixture.whenStable();

          expect(created).toEqual([pathOf(to)]);
          expect(el.querySelectorAll('pm-counted')).toHaveLength(1);
          expect(el.querySelectorAll('router-outlet')).toHaveLength(1);
          // Le même <main>, seul de la page : seul l'habillage autour a changé.
          expect(el.querySelector('main#main')).toBe(main);
          expect(el.querySelectorAll('main')).toHaveLength(1);
        });
      }
    }

    it('changement d’habillage, focus perdu : la tabulation repart du début de la coquille', async () => {
      const { fixture, el } = await render('fr', { url: '/c/public', firstRender: true });
      const focused = vi.fn();
      el.addEventListener('focus', focused);

      await TestBed.inject(Router).navigateByUrl('/c/practitioner');
      await fixture.whenStable();

      // La coquille a reçu le focus un instant (point de départ de Tab), puis l'a rendu.
      expect(focused).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(document.body);
      expect(el.hasAttribute('tabindex')).toBe(false);
    });

    it('changement d’habillage, focus vivant : il n’est pas déplacé', async () => {
      const { fixture, el } = await render('fr', { url: '/c/public', firstRender: true });
      const outside = document.body.appendChild(document.createElement('button'));
      outside.focus();
      const focused = vi.fn();
      el.addEventListener('focus', focused);

      await TestBed.inject(Router).navigateByUrl('/c/practitioner');
      await fixture.whenStable();

      expect(focused).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it('connexion pendant que la page est affichée : barres changées, page conservée', async () => {
      const { fixture, el } = await render('fr', { url: '/c/practitioner', firstRender: true });
      const page = el.querySelector('pm-counted');
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
      await fixture.whenStable();
      expect(el.querySelector('pm-verification-banner .banner')).not.toBeNull();
      expect(el.querySelector('pm-counted')).toBe(page);
      expect(created).toHaveLength(1);
    });

    it('avant la fin de la première navigation, aucun habillage supposé : ni barre, ni <main>, ni outlet', async () => {
      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [provideRouter([]), { provide: SessionApi, useValue: sessionApi }],
      });
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(tags(el)).toEqual(['pm-toast-outlet']);
      expect(el.querySelector('pm-app-bar, pm-shortcuts-help, main, router-outlet')).toBeNull();
    });

    it('ouverture directe : la coquille ne prend pas le focus (aucun changement d’habillage vu)', async () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      try {
        for (const layout of ['public', 'admin', 'practitioner']) {
          const { fixture, el } = await render('fr', { url: `/c/${layout}`, firstRender: true });
          await fixture.whenStable();
          expect(focus.mock.contexts).not.toContain(el);
          expect(document.activeElement).toBe(document.body);
          TestBed.resetTestingModule();
        }
      } finally {
        focus.mockRestore();
      }
    });

    it('première navigation annulée par un garde qui redirige : l’outlet apparaît, la page est créée une fois', async () => {
      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([
            {
              path: 'prive',
              canActivate: [() => inject(Router).parseUrl('/c/public')],
              component: Blank,
            },
            { path: 'c/public', component: Counted, data: { layout: 'public' } },
          ]),
          { provide: SessionApi, useValue: sessionApi },
        ],
      });
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.whenStable();
      const router = TestBed.inject(Router);
      const events: string[] = [];
      router.events.subscribe((event) => events.push(event.constructor.name));

      await router.navigateByUrl('/prive');
      await fixture.whenStable();

      expect(events).toContain('NavigationCancel');
      expect(events.at(-1)).toBe('NavigationEnd');
      expect(created).toEqual(['/c/public']);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('router-outlet')).toHaveLength(1);
      expect(el.querySelector('main#main.public-main pm-counted')).not.toBeNull();
      expect(el.querySelector('pm-app-bar')).toBeNull();
    });

    it('première navigation en erreur (loadComponent rejeté) puis navigation réussie : la page est créée une fois', async () => {
      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([
            { path: 'casse', loadComponent: () => Promise.reject(new Error('chunk absent')) },
            { path: 'c/practitioner', component: Counted },
          ]),
          { provide: SessionApi, useValue: sessionApi },
        ],
      });
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.whenStable();
      const router = TestBed.inject(Router);
      const el = fixture.nativeElement as HTMLElement;

      await expect(router.navigateByUrl('/casse')).rejects.toThrow('chunk absent');
      await fixture.whenStable();
      // Échec sans suite : l'écran n'est pas laissé vide (habillage par défaut, outlet vide).
      expect(el.querySelectorAll('router-outlet')).toHaveLength(1);
      expect(el.querySelector('pm-counted')).toBeNull();

      await router.navigateByUrl('/c/practitioner');
      await fixture.whenStable();
      expect(created).toEqual(['/c/practitioner']);
      expect(el.querySelectorAll('router-outlet')).toHaveLength(1);
      expect(el.querySelector('main#main.app-main pm-counted')).not.toBeNull();
    });
  });
});

/** Balises des enfants directs, dans l'ordre du DOM. */
function tags(parent: Element): string[] {
  return [...parent.children].map((child) => child.tagName.toLowerCase());
}
