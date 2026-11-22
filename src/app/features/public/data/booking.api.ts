import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CreateBookingRequestLocaleEnum,
  CreateBookingRequestModalityEnum,
  PriseDeRendezVousEnLigneService,
  PublicAppointmentDto,
  PublicBookingDto,
  PublicSlotsDto,
} from '../../../api';
import {
  BOOKING_MODALITIES,
  BookingModality,
  BookingRequest,
  CancelledBy,
  PublicAppointment,
  PublicAppointmentStatus,
  PublicBooking,
  SlotList,
  SlotWindow,
} from './booking.models';

/**
 * Service de données de la prise de rendez-vous en ligne (fiche 31, contrat contract-v0.15.0) :
 * routes publiques, sans session, `Cache-Control: no-store`. Avec directory.api.ts, les deux seuls
 * fichiers de features/public qui importent le client généré (un service de données par contexte
 * de l'API, comme features/account). Les erreurs arrivent en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class BookingApi {
  private readonly booking = inject(PriseDeRendezVousEnLigneService);

  /** GET /api/public/booking/practitioners/{slug} ; 404 BOOKING_NOT_AVAILABLE si non offerte. */
  async settings(slug: string): Promise<PublicBooking> {
    return toBooking(await firstValueFrom(this.booking.getPublicBooking(slug)));
  }

  /**
   * GET …/slots?from&to : créneaux offerts, instants UTC triés ; liste vide si aucun n'est libre,
   * ou si la fenêtre est passée ou au-delà de l'horizon (jamais une erreur dans ce cas).
   */
  async slots(slug: string, window: SlotWindow): Promise<SlotList> {
    const dto: PublicSlotsDto = await firstValueFrom(
      this.booking.listPublicBookingSlots(slug, window.from, window.to),
    );
    return {
      window,
      timezone: dto.timezone ?? '',
      slots: (dto.slots ?? []).map((slot) => ({
        startsAt: slot.startsAt ?? '',
        endsAt: slot.endsAt ?? '',
      })),
    };
  }

  /**
   * POST …/requests → 202 sans corps, y compris quand le serveur ignore la demande en silence (pot
   * de miel, envoi en moins de 3 s, plafond d'e-mails) ; 404, 409, 422 et 429 en ApiProblem.
   */
  async request(slug: string, request: BookingRequest): Promise<void> {
    await firstValueFrom(
      this.booking.createBookingRequest(slug, {
        startsAt: request.startsAt,
        modality: request.modality as CreateBookingRequestModalityEnum,
        firstName: request.firstName.trim(),
        lastName: request.lastName.trim(),
        email: request.email.trim(),
        phone: request.phone.trim() || undefined,
        locale: request.locale as CreateBookingRequestLocaleEnum,
        consent: request.consent,
        website: request.website,
        formShownAt: request.formShownAt,
      }),
    );
  }

  /**
   * POST /api/public/booking/requests/verify (fiche 32) : le jeton du lien voyage dans le corps,
   * jamais dans l'URL. Idempotent pour une demande déjà vérifiée (même après les 30 minutes) ;
   * `manageToken` seulement à la première vérification. 404, 409, 410, 422, 429 en ApiProblem.
   */
  async verify(token: string): Promise<PublicAppointment> {
    return toAppointment(await firstValueFrom(this.booking.verifyBookingRequest({ token })));
  }

  /** POST /api/public/booking/manage : état du rendez-vous par le lien de gestion (jeton dans le corps). */
  async manage(token: string): Promise<PublicAppointment> {
    return toAppointment(await firstValueFrom(this.booking.getManagedBooking({ token })));
  }

  /**
   * POST /api/public/booking/manage/cancel : annule (idempotent sur un rendez-vous déjà annulé) ;
   * 409 APPOINTMENT_NOT_ACTIVE si le rendez-vous a commencé ou est terminé.
   */
  async cancel(token: string): Promise<PublicAppointment> {
    return toAppointment(await firstValueFrom(this.booking.cancelManagedBooking({ token })));
  }
}

const APPOINTMENT_STATUSES: readonly PublicAppointmentStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
  'past',
];
const CANCELLED_BY: readonly CancelledBy[] = ['visitor', 'practitioner', 'expired'];

function toAppointment(dto: PublicAppointmentDto): PublicAppointment {
  const status = APPOINTMENT_STATUSES.find((value) => value === dto.status) ?? 'pending';
  const [modality] = toModalities(dto.modality ? [dto.modality] : []);
  return {
    status,
    cancelledBy: CANCELLED_BY.find((value) => value === dto.cancelledBy) ?? null,
    startsAt: dto.startsAt ?? '',
    endsAt: dto.endsAt ?? '',
    durationMin: dto.durationMin ?? 0,
    modality: modality ?? 'in_person',
    practitioner: {
      slug: dto.practitioner?.slug || null,
      displayName: dto.practitioner?.displayName || null,
    },
    canCancel: dto.canCancel === true,
    manageToken: dto.manageToken || null,
  };
}

function toModalities(values: string[] | undefined): BookingModality[] {
  return (values ?? []).filter((value): value is BookingModality =>
    (BOOKING_MODALITIES as readonly string[]).includes(value),
  );
}

function toBooking(dto: PublicBookingDto): PublicBooking {
  return {
    slug: dto.slug ?? '',
    displayName: dto.displayName ?? '',
    confirmation: dto.confirmation === 'auto' ? 'auto' : 'manual',
    slotDurationMin: dto.slotDurationMin ?? 0,
    modalities: toModalities(dto.modalities),
    timezone: dto.timezone ?? 'Europe/Paris',
    minNoticeHours: dto.minNoticeHours ?? 0,
    horizonDays: dto.horizonDays ?? 0,
  };
}
