// Modèles de la prise de rendez-vous en ligne (fiche 31, contrat contract-v0.15.0), tels que les
// écrans les lisent : booking.api.ts traduit le client généré vers ces formes (null = absent).

/** Modalités du contrat (PublicBookingDto.modalities, CreateBookingRequest.modality), dans l'ordre. */
export const BOOKING_MODALITIES = ['in_person', 'video', 'phone'] as const;
export type BookingModality = (typeof BOOKING_MODALITIES)[number];

/** manual : le praticien répond à chaque demande ; auto : confirmé dès l'e-mail vérifié (G Q61). */
export type BookingConfirmation = 'manual' | 'auto';

/** GET /api/public/booking/practitioners/{slug} : réglages publics, jamais les plages. */
export interface PublicBooking {
  slug: string;
  displayName: string;
  confirmation: BookingConfirmation;
  slotDurationMin: number;
  modalities: BookingModality[];
  /** Fuseau IANA du praticien : les créneaux s'affichent dans ce fuseau. */
  timezone: string;
  minNoticeHours: number;
  horizonDays: number;
}

/** Un créneau offert, instants UTC ISO 8601 tels que l'API les renvoie. */
export interface BookingSlot {
  startsAt: string;
  endsAt: string;
}

/** Fenêtre de dates demandée, AAAA-MM-JJ dans le fuseau du praticien, `to` inclus. */
export interface SlotWindow {
  from: string;
  to: string;
}

/** GET …/slots : les créneaux de la fenêtre, dans l'ordre de l'API. */
export interface SlotList {
  window: SlotWindow;
  timezone: string;
  slots: BookingSlot[];
}

/** Corps de POST …/requests (CreateBookingRequest), sans champ libre (G Q72 de l'API). */
export interface BookingRequest {
  startsAt: string;
  modality: BookingModality;
  firstName: string;
  lastName: string;
  email: string;
  /** Chaîne vide : aucun téléphone. */
  phone: string;
  locale: 'fr' | 'en';
  consent: boolean;
  /** Pot de miel, toujours vide pour un humain. */
  website: string;
  /** Instant du premier affichage du formulaire de coordonnées, ISO 8601 UTC. */
  formShownAt: string;
}

/** Limites du contrat (CreateBookingRequest). */
export const BOOKING_LIMITS = { firstName: 100, lastName: 100, email: 320, phone: 30 } as const;
