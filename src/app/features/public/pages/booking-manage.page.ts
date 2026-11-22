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
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../core/http';
import { ConfirmDialogService } from '../../../shared/ui';
import { BookingLinkStore } from '../data/booking-link.store';
import { BookingBarComponent } from '../ui/booking-bar.component';
import { BookingLinkCardComponent } from '../ui/booking-link-card.component';
import {
  cancelFailureMessage,
  cancelLinkInvalidView,
  manageFailedView,
  managedView,
} from '../ui/booking-link-views';
import { PublicMeta } from './page-meta';

const TITLE_ID = 'booking-manage-title';

/** État d'écran de l'annulation (fiche 32) : l'ouverture du dialogue n'est pas gardée ailleurs. */
type CancelStatus = 'idle' | 'sending' | 'too-late' | 'rate-limited' | 'error';

/**
 * /rendez-vous/gerer/:token (fiche 32, maquette 32 vues 14 à 29) : état du rendez-vous pris en
 * ligne, lu par POST …/manage avec le jeton du lien de gestion dans le corps, et son annulation
 * (dialogue partagé, aucun motif demandé), suivie d'une relecture de l'état. Pas de modification
 * du rendez-vous. Le jeton n'est lu que dans le chemin ; `<meta name="referrer"
 * content="no-referrer">` tant que la page est affichée. Non prérendue, `noindex`.
 */
@Component({
  selector: 'pm-booking-manage-page',
  imports: [MatButtonModule, BookingBarComponent, BookingLinkCardComponent],
  providers: [BookingLinkStore],
  template: `
    <pm-booking-link-card
      [view]="view()"
      [titleId]="titleId"
      [loadingLabel]="loadingLabel"
      (retry)="reload()"
      (cancelAsked)="askCancel()"
    >
      <div linkAlert class="alerts">
        @switch (cancelStatus()) {
          @case ('error') {
            <pm-booking-bar level="danger" role="alert">
              <span class="bar-text">{{ cancelMessage() }}</span>
              <button
                mat-stroked-button
                type="button"
                class="bar-retry"
                (click)="sendCancel()"
                i18n="Bouton Réessayer de l'annulation@@public.bookingLink.manage.cancelRetry"
              >
                Réessayer
              </button>
            </pm-booking-bar>
          }
          @case ('too-late') {
            <pm-booking-bar level="warning" role="alert">{{ cancelMessage() }}</pm-booking-bar>
          }
          @case ('rate-limited') {
            <pm-booking-bar level="warning" role="alert">{{ cancelMessage() }}</pm-booking-bar>
          }
        }
      </div>
    </pm-booking-link-card>
  `,
  styles: `
    :host {
      display: block;
    }

    // Sans message, l'enveloppe ne crée aucune case dans la colonne de la carte.
    .alerts {
      display: contents;
    }

    .bar-text {
      display: block;
    }

    .bar-retry {
      margin-top: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingManagePage {
  /** Paramètre de route :token (withComponentInputBinding) : jamais copié ailleurs. */
  readonly token = input.required<string>();

  protected readonly store = inject(BookingLinkStore);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly meta = inject(PublicMeta);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly titleId = TITLE_ID;
  protected readonly loadingLabel = $localize`:Annonce pendant le chargement du rendez-vous@@public.bookingLink.manage.loading:Chargement de votre rendez-vous…`;

  // État d'écran.
  protected readonly cancelStatus = signal<CancelStatus>('idle');
  private readonly cancelProblem = signal<ApiProblem | null>(null);
  /** 404 sur manage/cancel : le lien a été remplacé entre-temps ; vue « lien remplacé ». */
  private readonly cancelLinkInvalid = signal(false);
  private destroyed = false;

  protected readonly view = computed(() => {
    if (this.cancelLinkInvalid()) return cancelLinkInvalidView();
    const managed = this.store.managed();
    switch (managed.status) {
      case 'loaded':
        return managed.data ? managedView(managed.data) : null;
      case 'error':
        return manageFailedView(managed.problem);
      default:
        return null;
    }
  });

  protected readonly cancelMessage = computed(() => {
    const status = this.cancelStatus();
    return status === 'idle' || status === 'sending'
      ? ''
      : cancelFailureMessage(status, this.cancelProblem());
  });

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    // La balise referrer est posée avant la première requête : aucun Referer ne porte le jeton.
    this.meta.apply(
      {
        description: $localize`:Description de la page de gestion d'un rendez-vous@@public.bookingLink.manage.meta.description:État de votre rendez-vous pris en ligne avec un praticien de l'annuaire PsyMate.`,
        robots: 'noindex,follow',
        canonicalPath: null,
        referrer: 'no-referrer',
      },
      this.destroyRef,
    );
    if (this.browser) {
      effect(() => {
        const token = this.token();
        untracked(() => void this.load(token));
      });
    }
  }

  /** « Réessayer » après un échec de chargement. */
  protected reload(): void {
    void this.load(this.token());
  }

  /** « Annuler ma demande » / « Annuler mon rendez-vous » : dialogue partagé, aucun motif. */
  protected async askCancel(): Promise<void> {
    const appointment = this.store.managed().data;
    if (!appointment || this.cancelStatus() === 'sending') return;
    const request = appointment.status === 'pending';
    const confirmed = await this.confirmDialog.confirm({
      title: request
        ? $localize`:Titre du dialogue d'annulation d'une demande@@public.bookingLink.manage.dialog.requestTitle:Annuler cette demande ?`
        : $localize`:Titre du dialogue d'annulation d'un rendez-vous@@public.bookingLink.manage.dialog.appointmentTitle:Annuler ce rendez-vous ?`,
      description: $localize`:Texte du dialogue d'annulation@@public.bookingLink.manage.dialog.text:Le praticien sera prévenu par e-mail. Pour un autre créneau, il faudra refaire une demande.`,
      confirmLabel: request
        ? $localize`:Confirmation de l'annulation d'une demande@@public.bookingLink.manage.dialog.confirmRequest:Annuler la demande`
        : $localize`:Confirmation de l'annulation d'un rendez-vous@@public.bookingLink.manage.dialog.confirmAppointment:Annuler le rendez-vous`,
      cancelLabel: $localize`:Bouton qui garde le rendez-vous@@public.bookingLink.manage.dialog.keep:Garder`,
      destructive: true,
    });
    if (!confirmed || this.destroyed) return;
    await this.sendCancel();
  }

  /** POST …/manage/cancel, puis relecture (store) ; « Réessayer » du message d'échec la renvoie. */
  protected async sendCancel(): Promise<void> {
    if (this.cancelStatus() === 'sending') return;
    this.cancelStatus.set('sending');
    this.cancelProblem.set(null);
    const result = await this.store.cancel(this.token());
    if (this.destroyed || result.outcome === 'cancelled-page') return;
    switch (result.outcome) {
      case 'cancelled':
        this.cancelStatus.set('idle');
        this.focusTitle();
        return;
      case 'link-invalid':
        this.cancelStatus.set('idle');
        this.cancelLinkInvalid.set(true);
        this.focusTitle();
        return;
      case 'too-late':
        this.cancelProblem.set(result.problem);
        this.cancelStatus.set('too-late');
        this.focusTitle();
        return;
      default:
        this.cancelProblem.set(result.problem);
        this.cancelStatus.set(result.outcome);
    }
  }

  private async load(token: string): Promise<void> {
    this.cancelStatus.set('idle');
    this.cancelProblem.set(null);
    this.cancelLinkInvalid.set(false);
    await this.store.loadManaged(token);
    this.focusTitle();
  }

  private focusTitle(): void {
    if (this.destroyed) return;
    afterNextRender(() => this.document.getElementById(TITLE_ID)?.focus(), {
      injector: this.injector,
    });
  }
}
