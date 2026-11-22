import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { bookingPath, manageBookingPath, PUBLIC_FEATURE_PATHS } from '../public-paths';
import { BookingBarComponent } from './booking-bar.component';
import { BookingLinkBadgeComponent } from './booking-link-badge.component';
import { BookingLinkDetailComponent } from './booking-link-detail.component';
import { LinkView } from './booking-link-views';
import { EmergencyNoteComponent } from './emergency-note.component';

/**
 * Carte des pages par lien (fiche 32, « Structure commune », maquette 32) : pictogramme d'état,
 * `<h1>` (cible du focus), pastille, phrases ; avertissement ; message projeté par la page
 * (`[linkAlert]`) ; détail du rendez-vous ; mention d'urgence au-dessus de l'action principale ;
 * action. Sans vue (`view` null) : squelette, annoncé par `loadingLabel`. Les liens de la carte
 * portent rel="noreferrer".
 */
@Component({
  selector: 'pm-booking-link-card',
  imports: [
    MatButtonModule,
    RouterLink,
    BookingBarComponent,
    BookingLinkBadgeComponent,
    BookingLinkDetailComponent,
    EmergencyNoteComponent,
  ],
  template: `
    @if (view(); as v) {
      <section class="card" [attr.aria-labelledby]="titleId()" [attr.data-view]="v.key">
        <div class="head" [attr.role]="v.role">
          <pm-booking-link-badge [icon]="v.icon" [tone]="v.tone" />
          <h1 [id]="titleId()" tabindex="-1">{{ v.title }}</h1>
          @if (v.pill; as pill) {
            <span class="pill" [class]="pill.tone">{{ pill.label }}</span>
          }
          @if (v.texts.length || v.secondary) {
            <div class="text">
              @for (text of v.texts; track $index) {
                <p>{{ text }}</p>
              }
              @if (v.secondary) {
                <p class="secondary">{{ v.secondary }}</p>
              }
            </div>
          }
        </div>
        @if (v.warning) {
          <pm-booking-bar level="warning" role="alert">{{ v.warning }}</pm-booking-bar>
        }
        <ng-content select="[linkAlert]" />
        @if (v.appointment; as appointment) {
          <pm-booking-link-detail [appointment]="appointment" />
        }
        <pm-emergency-note />
        @if (v.action; as action) {
          <div class="actions">
            @switch (action.kind) {
              @case ('manage') {
                @if (action.kind === 'manage') {
                  <a
                    mat-flat-button
                    class="large"
                    rel="noreferrer"
                    [routerLink]="managePath(action.token)"
                    >{{ action.label }}</a
                  >
                }
              }
              @case ('rebook') {
                @if (action.kind === 'rebook') {
                  <a
                    mat-stroked-button
                    rel="noreferrer"
                    [routerLink]="bookingLink(action.slug)"
                    i18n="Lien vers les créneaux du praticien@@public.bookingLink.rebook"
                    >Choisir un autre créneau</a
                  >
                }
              }
              @case ('directory') {
                <a
                  mat-stroked-button
                  rel="noreferrer"
                  [routerLink]="directory"
                  i18n="Lien vers l'annuaire@@public.bookingLink.directory"
                  >Retrouver le praticien dans l'annuaire</a
                >
              }
              @case ('retry') {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="retry.emit()"
                  i18n="Bouton Réessayer d'une page par lien@@public.bookingLink.retry"
                >
                  Réessayer
                </button>
              }
              @case ('cancel') {
                @if (action.kind === 'cancel') {
                  <button
                    mat-stroked-button
                    type="button"
                    class="cancel"
                    (click)="cancelAsked.emit()"
                  >
                    {{ action.label }}
                  </button>
                }
              }
            }
          </div>
        }
      </section>
    } @else {
      <section class="card" aria-busy="true">
        <div class="skeleton" role="status" [attr.aria-label]="loadingLabel()">
          <span class="skel badge"></span>
          <span class="skel title"></span>
          <span class="skel line"></span>
          <span class="skel block"></span>
        </div>
        <p class="sr-only">{{ loadingLabel() }}</p>
        <pm-emergency-note />
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    // Carte de 520 px au plus, centrée dans le layout public (fiche 32, comme la fiche 25).
    .card {
      display: flex;
      flex-direction: column;
      gap: 20px;
      width: 100%;
      max-width: 520px;
      margin: 0 auto;
      padding: 32px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--surface-raised);
      box-shadow: 0 1px 2px var(--scrim);
    }

    p,
    h1 {
      margin: 0;
    }

    .head {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }

    h1 {
      font: 600 24px/32px var(--font-ui);
      overflow-wrap: anywhere;
    }

    // Cible du focus à l'arrivée d'une réponse : un titre, pas une commande.
    h1[tabindex='-1']:focus {
      outline: none;
      box-shadow: none;
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .secondary {
      color: var(--text-secondary);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 9999px;
      font: 600 12px/16px var(--font-ui);
      white-space: nowrap;

      &.info {
        background: var(--info-bg);
        color: var(--info);
      }

      &.success {
        background: var(--success-bg);
        color: var(--success);
      }

      &.neutral {
        background: var(--surface-sunken);
        color: var(--text-primary);
      }
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
    }

    .large {
      --mat-button-filled-container-height: 40px;
    }

    .skeleton {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skel {
      display: block;
      height: 14px;
      border-radius: 4px;
      background: var(--surface-sunken);

      &.badge {
        width: 48px;
        height: 48px;
      }

      &.title {
        width: 70%;
        height: 28px;
      }

      &.line {
        width: 90%;
      }

      &.block {
        height: 120px;
      }
    }

    @media (max-width: 600px) {
      .card {
        padding: 20px 16px;
      }

      .actions a,
      .actions button {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingLinkCardComponent {
  /** Vue à dessiner ; null pendant le chargement (squelette). */
  readonly view = input.required<LinkView | null>();
  /** Identifiant du `<h1>`, cible du focus. */
  readonly titleId = input.required<string>();
  /** Annonce du chargement (« Vérification de votre adresse… »). */
  readonly loadingLabel = input.required<string>();

  readonly retry = output<void>();
  readonly cancelAsked = output<void>();

  protected readonly directory = PUBLIC_FEATURE_PATHS.directory;
  protected readonly managePath = manageBookingPath;
  protected readonly bookingLink = bookingPath;
}
