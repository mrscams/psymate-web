import { PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AUTH_PATHS, SessionStore } from './core/auth';
import { localeSwitchHref, otherLocale, toAppLocale } from './core/i18n';
import { ThemeService } from './core/theme';
import {
  AdminBarComponent,
  AppBarComponent,
  NetworkBannerComponent,
  PublicLayoutComponent,
  ToastOutletComponent,
  VerificationBannerComponent,
} from './shared/ui';

/**
 * Habillage d'une route, porté par `data.layout` (hérité des parents) :
 * - practitioner (défaut) : barre d'application, bandeaux d'état, <main> ;
 * - public : layout public (fiche 00 §4), sans barre d'application ; conteneur étroit (480 px) des
 *   formulaires, sauf si une route déclare `data.wide` (annuaire, fiche praticien, comment ça marche) ;
 * - admin : barre d'administration (fiche 00 §5) ;
 * - bare : la route seule (page de démonstration).
 */
export type AppLayout = 'practitioner' | 'public' | 'admin' | 'bare';

/**
 * Coquille de l'application (fiche 00) : choisit l'habillage selon la route, passe la session à la
 * barre d'application et au bandeau d'état, pose les toasts et le bandeau réseau une seule fois.
 */
@Component({
  selector: 'pm-root',
  imports: [
    RouterOutlet,
    AdminBarComponent,
    AppBarComponent,
    NetworkBannerComponent,
    PublicLayoutComponent,
    ToastOutletComponent,
    VerificationBannerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  protected readonly locale = toAppLocale(inject(LOCALE_ID));
  protected readonly other = otherLocale(this.locale);

  private readonly navigation = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => ({
        url: this.router.url,
        layout: layoutOf(this.router.routerState.snapshot.root),
        wide: isWide(this.router.routerState.snapshot.root),
      })),
    ),
    {
      initialValue: {
        url: this.router.url,
        layout: layoutOf(this.router.routerState.snapshot.root),
        wide: isWide(this.router.routerState.snapshot.root),
      },
    },
  );

  protected readonly layout = computed(() => this.navigation().layout);
  protected readonly narrow = computed(() => !this.navigation().wide);
  protected readonly switchHref = computed(() =>
    localeSwitchHref(this.baseHref, this.navigation().url, this.other),
  );
  protected readonly user = computed(() => {
    const me = this.session.me();
    return me ? { displayName: me.displayName } : null;
  });

  constructor() {
    // Applique data-theme dès le démarrage ; la clé `theme` des préférences le pilote (core/preferences).
    inject(ThemeService);
  }

  /** POST /api/auth/logout, puis retour à la connexion. */
  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(AUTH_PATHS.login);
  }
}

/** `data.layout` de la route la plus profonde qui en déclare un ; practitioner sinon. */
export function layoutOf(root: ActivatedRouteSnapshot): AppLayout {
  let layout: AppLayout = 'practitioner';
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    const declared = route.data['layout'];
    if (declared) layout = declared as AppLayout;
  }
  return layout;
}

/** Une route de la chaîne déclare `data.wide` : layout public pleine largeur (1120 px). */
export function isWide(root: ActivatedRouteSnapshot): boolean {
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    if (route.data['wide'] === true) return true;
  }
  return false;
}
