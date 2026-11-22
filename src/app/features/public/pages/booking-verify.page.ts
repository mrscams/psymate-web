import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  untracked,
} from '@angular/core';

import { BookingLinkStore } from '../data/booking-link.store';
import { BookingLinkCardComponent } from '../ui/booking-link-card.component';
import { verifiedView, verifyFailedView } from '../ui/booking-link-views';
import { PublicMeta } from './page-meta';

const TITLE_ID = 'booking-verify-title';

/**
 * /rendez-vous/confirmer/:token (fiche 32, maquette 32 vues 1 à 13) : suite du lien de vérification
 * reçu par e-mail. La page envoie le jeton une seule fois par affichage, sans geste du visiteur,
 * dans le corps de POST …/requests/verify, et montre l'une des vues de la fiche. Le jeton n'est lu
 * que dans le chemin, jamais écrit dans le stockage du navigateur ; `<meta name="referrer"
 * content="no-referrer">` tant que la page est affichée. Non prérendue, `noindex`.
 */
@Component({
  selector: 'pm-booking-verify-page',
  imports: [BookingLinkCardComponent],
  providers: [BookingLinkStore],
  template: `
    <pm-booking-link-card
      [view]="view()"
      [titleId]="titleId"
      [loadingLabel]="loadingLabel"
      (retry)="verify()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingVerifyPage {
  /** Paramètre de route :token (withComponentInputBinding) : jamais copié ailleurs. */
  readonly token = input.required<string>();

  protected readonly store = inject(BookingLinkStore);
  private readonly meta = inject(PublicMeta);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly titleId = TITLE_ID;
  protected readonly loadingLabel = $localize`:Annonce pendant la vérification de l'e-mail@@public.bookingLink.verify.loading:Vérification de votre adresse…`;

  protected readonly view = computed(() => {
    const verification = this.store.verification();
    switch (verification.status) {
      case 'loaded':
        return verification.data ? verifiedView(verification.data) : null;
      case 'error':
        return verifyFailedView(verification.problem);
      default:
        return null;
    }
  });

  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    // La balise referrer est posée avant la première requête : aucun Referer ne porte le jeton.
    this.meta.apply(
      {
        description: $localize`:Description de la page de vérification d'une demande de rendez-vous@@public.bookingLink.verify.meta.description:Vérification de votre adresse e-mail pour une demande de rendez-vous en ligne PsyMate.`,
        robots: 'noindex,follow',
        canonicalPath: null,
        referrer: 'no-referrer',
      },
      this.destroyRef,
    );
    // Une seule vérification par affichage (et par jeton) ; jamais au rendu serveur.
    if (this.browser) {
      effect(() => {
        const token = this.token();
        untracked(() => void this.verify(token));
      });
    }
  }

  /** POST …/requests/verify ; « Réessayer » renvoie le même appel (idempotent). */
  protected async verify(token = this.token()): Promise<void> {
    await this.store.verify(token);
    this.focusTitle();
  }

  private focusTitle(): void {
    if (this.destroyed) return;
    afterNextRender(() => this.document.getElementById(TITLE_ID)?.focus(), {
      injector: this.injector,
    });
  }
}
