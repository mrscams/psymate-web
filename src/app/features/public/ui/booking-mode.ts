import { BookingConfirmation } from '../data/booking.models';

/**
 * Phrase du mode de confirmation (G Q61, textes exacts), dans l'en-tête et répétée au-dessus du
 * bouton d'envoi (fiche 31) : une demande n'est pas une réservation.
 */
export function modeSentence(confirmation: BookingConfirmation): string {
  return confirmation === 'auto'
    ? $localize`:Phrase du mode automatique (G Q61)@@public.booking.mode.auto:Votre rendez-vous sera confirmé dès que vous aurez validé votre adresse e-mail.`
    : $localize`:Phrase du mode manuel (G Q61)@@public.booking.mode.manual:Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.`;
}
