import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PublicAppointment } from '../data/booking.models';
import { practitionerPath } from '../public-paths';
import { appointmentDetail } from './booking-link-format';

/**
 * Détail du rendez-vous des pages par lien (fiche 32, maquette 32 « detail ») : liste de
 * définitions Praticien (absente si la fiche n'est plus publiée), Date, Heure (fuseau du
 * navigateur, nommé), Durée, Modalité. Le lien vers la fiche porte rel="noreferrer" : le chemin de
 * la page, qui porte le jeton, ne part dans aucun en-tête Referer.
 */
@Component({
  selector: 'pm-booking-link-detail',
  imports: [RouterLink],
  template: `
    @let d = detail();
    <dl class="detail">
      @if (d.practitioner; as p) {
        <dt i18n="Terme du détail, praticien@@public.bookingLink.detail.practitioner">Praticien</dt>
        <dd>
          <a [routerLink]="practitionerLink(p.slug)" rel="noreferrer">{{ p.name }}</a>
        </dd>
      }
      <dt i18n="Terme du détail, date@@public.bookingLink.detail.date">Date</dt>
      <dd>{{ d.day }}</dd>
      <dt i18n="Terme du détail, heure@@public.bookingLink.detail.time">Heure</dt>
      <dd>
        <span class="mono">{{ d.hours }}</span
        ><span class="tz">{{ d.zone }}</span>
      </dd>
      <dt i18n="Terme du détail, durée@@public.bookingLink.detail.durationTerm">Durée</dt>
      <dd>{{ d.duration }}</dd>
      <dt i18n="Terme du détail, modalité@@public.bookingLink.detail.modality">Modalité</dt>
      <dd>{{ d.modality }}</dd>
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }

    .detail {
      display: grid;
      grid-template-columns: 112px 1fr;
      gap: 8px 16px;
      margin: 0;
      padding: 16px;
      border-radius: 4px;
      background: var(--surface-ground);
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      min-width: 0;
      margin: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    a {
      color: var(--primary);
    }

    .mono {
      font-family: var(--font-mono);
    }

    .tz {
      display: block;
      color: var(--text-secondary);
      font: 400 12px/16px var(--font-ui);
    }

    @media (max-width: 600px) {
      .detail {
        grid-template-columns: 1fr;
        gap: 2px;
      }

      dd {
        margin-bottom: 8px;
      }

      dd:last-child {
        margin-bottom: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingLinkDetailComponent {
  readonly appointment = input.required<PublicAppointment>();

  private readonly locale = inject(LOCALE_ID);
  protected readonly detail = computed(() => appointmentDetail(this.appointment(), this.locale));
  protected readonly practitionerLink = practitionerPath;
}
