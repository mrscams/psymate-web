import { DOCUMENT, PlatformLocation } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

import { AUTH_PATHS, SessionStore } from './core/auth';
import { localeSwitchHref, otherLocale, toAppLocale } from './core/i18n';
import { ShortcutsHelpComponent } from './features/patient-shell';
import { DossierSearchBar } from './features/search';
import { ThemeService } from './core/theme';
import {
  AdminBarComponent,
  AppBarComponent,
  NavDrawerService,
  NavRailComponent,
  NetworkBannerComponent,
  PublicFooterComponent,
  PublicHeaderComponent,
  ToastOutletComponent,
  VerificationBannerComponent,
} from './shared/ui';

/**
 * Habillage d'une route, porté par `data.layout` (hérité des parents) :
 * - practitioner (défaut) : barre d'application, bandeaux d'état, <main> ;
 * - public : layout public (fiche 00 §4), sans barre d'application ; conteneur étroit (480 px) des
 *   formulaires, sauf si une route déclare `data.wide` (annuaire, fiche praticien, comment ça marche) ;
 * - admin : barre d'administration (fiche 00 §5) ;
 * - bare : la page seule, qui possède toute sa structure (voir « Pages nues » plus bas).
 */
export type AppLayout = 'practitioner' | 'public' | 'admin' | 'bare';

/**
 * Largeur du contenu, portée par `data.contentWidth` (UX-A8, hérité des parents, la route la plus
 * profonde l'emporte) :
 * - default : 1 120 px (`conteneur `.app-main``, layout public large), 480 px pour les formulaires
 *   publics ;
 * - wide : layout public jusqu'à 1 280 px (annuaire, maquette 08) ; conteneur des habillages
 *   praticien et admin jusqu'à 1 600 px de contenu (écrans d'administration, maquettes 20, 21, 22, 28 : pleine
 *   largeur à 1 440 px avec 24 px de marge), sans marges négatives dans la page ;
 * - full : aucune borne ni marge sur le conteneur praticien (UX-S5, onglet Séance, propositions 04
 *   et 04b : barre de séance et en-tête d'un bord à l'autre sous la barre d'application) ; la page
 *   pose elle-même ses marges intérieures.
 */
export type ContentWidth = 'default' | 'wide' | 'full';

/**
 * Coquille de l'application (fiche 00) : choisit l'habillage selon la route, passe la session à la
 * barre d'application et au bandeau d'état, pose les toasts et le bandeau réseau une seule fois.
 * Habillage praticien : la touche ? ouvre l'aide des raccourcis (features/patient-shell, M7-03).
 *
 * UX-A10 : un seul `<main id="main">` et un seul `<router-outlet>`, stables, servent les quatre
 * habillages ; autour, seuls la barre, les bandeaux, le pied et les classes du `<main>` suivent
 * l'habillage. La page n'est donc jamais détruite ni recréée quand l'habillage change (fin de la
 * première navigation, connexion, déconnexion, 401, passage à /admin) : avant, chaque branche d'un
 * `@switch` portait son outlet et la page était créée deux fois, ses lectures parties deux fois.
 * Le conteneur reste un `<main>` (changer de balise recréerait l'outlet ; un `div role="main"` ferait
 * des `<header>` des pages autant de repères `banner`).
 *
 * Pages nues (habillage `bare`) : `/_demo`, `/premiere-connexion`, `/connexion` (deux panneaux).
 * - La coquille fournit le `<main id="main">`, sans classe ni marge ni largeur, précédé du seul
 *   bandeau réseau ; la page en est l'enfant et ne pose jamais de `<main>`, de `role="main"` ni
 *   d'`id="main"` (un seul repère `main`, un seul `#main` par page).
 * - Ses blocs répétés (barre, pied) sont donc dans le `<main>` : ce ne sont pas des repères `banner`
 *   / `contentinfo`. Si la page a une barre à sauter, son lien d'évitement vise l'`id` de son
 *   contenu (par exemple `#contenu`), jamais `#main`.
 * - Hauteur : la coquille passe en colonne flex et le `<main>` nu, lui-même en colonne flex, remplit
 *   la fenêtre sous le bandeau réseau (`flex: 1`) ; une page plein écran pose `flex: 1` sur son hôte,
 *   sans `100vh` / `100dvh`, et remplit exactement la fenêtre même avec le bandeau affiché.
 * - Défilement : le document défile, pas les panneaux de la page.
 *
 * Rail de navigation (UX-S8, proposition 05 A), habillage praticien seulement : `pm-nav-rail`, une
 * colonne de 56 px sous la barre d'application, positionnée en absolu sur toute la hauteur de la
 * coquille ; la coquille (classe `with-rail`) décale d'autant tout ce qui suit la barre (bandeaux,
 * `<main>`, y compris `.wide` et `.full`) : aucune page ne pose ce décalage. Le rail se déplie
 * par-dessus la page sans la décaler. Sous 900 px, il disparaît et le bouton ☰ de la barre ouvre
 * le même composant en tiroir (NavDrawerService). Le `<main>` reste un enfant direct et stable de
 * la coquille (UX-A10) : le rail est un frère, pas un parent.
 *
 * Rien n'est rendu avant la fin de la première navigation (`navigated`) : l'habillage n'est pas
 * supposé (ni barre praticien ni classe `app-main` sur une page publique), la route déjà activée
 * s'attache une fois à l'outlet, dans l'habillage de sa route. Pages prérendues : le HTML du
 * serveur reste en place, inerte, jusqu'à cette fin de navigation, puis l'hydratation reprend les
 * mêmes blocs (même habillage, même page) sans les reconstruire.
 */
@Component({
  selector: 'pm-root',
  imports: [
    RouterOutlet,
    AdminBarComponent,
    AppBarComponent,
    NavRailComponent,
    NetworkBannerComponent,
    PublicFooterComponent,
    PublicHeaderComponent,
    ShortcutsHelpComponent,
    ToastOutletComponent,
    VerificationBannerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.bare]': "navigated() && layout() === 'bare'",
    '[class.with-rail]': "navigated() && layout() === 'practitioner'",
  },
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);
  /** Champ de la barre sur un écran patient : recherche dans le dossier (features/search). */
  protected readonly searchBar = inject(DossierSearchBar);
  /** Tiroir de navigation sous 900 px (bouton ☰, Ctrl+B quand le rail est masqué). */
  protected readonly navDrawer = inject(NavDrawerService);
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
        contentWidth: contentWidthOf(this.router.routerState.snapshot.root),
      })),
    ),
    {
      initialValue: {
        url: this.router.url,
        layout: layoutOf(this.router.routerState.snapshot.root),
        wide: isWide(this.router.routerState.snapshot.root),
        contentWidth: contentWidthOf(this.router.routerState.snapshot.root),
      },
    },
  );

  /**
   * Vrai dès que la première navigation est terminée (ou déjà vrai si elle l'a été avant la création
   * de la coquille). Avant, l'habillage n'est pas connu : rien n'est rendu, la route activée
   * entre-temps attend dans son contexte et l'outlet l'affiche à sa création, une seule fois.
   * Terminée : `NavigationEnd`, ou un échec sans suite (`NavigationError`, `NavigationCancel` hors
   * redirection et hors remplacement par une autre navigation), pour ne jamais laisser l'écran vide.
   */
  protected readonly navigated = toSignal(
    this.router.events.pipe(
      filter(
        (event) =>
          event instanceof NavigationEnd ||
          event instanceof NavigationError ||
          (event instanceof NavigationCancel &&
            event.code !== NavigationCancellationCode.Redirect &&
            event.code !== NavigationCancellationCode.SupersededByNewNavigation),
      ),
      map(() => true),
    ),
    { initialValue: this.router.navigated },
  );

  protected readonly layout = computed(() => this.navigation().layout);
  protected readonly contentWidth = computed(() => this.navigation().contentWidth);
  /** Formulaires publics à 480 px, sauf route `data.wide` ou `data.contentWidth: 'wide'`. */
  protected readonly narrow = computed(
    () => !this.navigation().wide && this.navigation().contentWidth !== 'wide',
  );
  protected readonly switchHref = computed(() =>
    localeSwitchHref(this.baseHref, this.navigation().url, this.other),
  );
  protected readonly user = computed(() => {
    const me = this.session.me();
    return me ? { displayName: me.displayName } : null;
  });

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  constructor() {
    // Applique data-theme dès le démarrage ; la clé `theme` des préférences le pilote (core/preferences).
    inject(ThemeService);

    // Changement d'habillage (connexion, déconnexion…) : la tabulation repart du haut de la coquille,
    // comme quand l'habillage entier était reconstruit (avant UX-A10), et non de la place qu'occupait
    // dans le <main> le contrôle disparu avec l'ancienne page.
    // Rien à l'ouverture directe : l'habillage affiché d'abord est déjà celui de la route.
    const injector = inject(Injector);
    let shown: AppLayout | null = null;
    effect(() => {
      if (!this.navigated()) return;
      const layout = this.layout();
      if (shown !== null && layout !== shown) {
        afterNextRender(() => this.restartSequentialFocus(), { injector });
      }
      shown = layout;
    });
  }

  /**
   * Si le focus est perdu (sur `body`), ramène le point de départ de la navigation au clavier au
   * début de la coquille : la touche Tab atteint alors d'abord le lien d'évitement. Un focus vivant
   * (posé par la page, ou dans un menu) n'est pas touché.
   */
  private restartSequentialFocus(): void {
    const active = this.document.activeElement;
    if (active && active !== this.document.body && active.isConnected) return;
    this.host.setAttribute('tabindex', '-1');
    this.host.focus({ preventScroll: true });
    this.host.blur();
    this.host.removeAttribute('tabindex');
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

/** `data.contentWidth` de la route la plus profonde qui en déclare un ; default sinon. */
export function contentWidthOf(root: ActivatedRouteSnapshot): ContentWidth {
  let width: ContentWidth = 'default';
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    const declared = route.data['contentWidth'];
    if (declared === 'wide' || declared === 'default' || declared === 'full') width = declared;
  }
  return width;
}
