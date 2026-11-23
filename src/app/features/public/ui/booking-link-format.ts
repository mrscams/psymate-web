import { PublicAppointment } from '../data/booking.models';
import { dateKey } from '../data/booking-window';
import { dayLabel, modalityLabel, timeLabel } from './booking-format';

/**
 * Détail d'un rendez-vous des pages par lien (fiche 32). PublicAppointmentDto ne porte pas de
 * fuseau : date et heures sont dans le fuseau du navigateur, nommé à l'écran (« heure de votre
 * appareil, Europe/Paris »). Intl avec la locale de formatage (booking-format, Q73).
 */
export interface AppointmentDetail {
  /** Lien vers la fiche ; null quand la fiche n'est plus publiée (ligne « Praticien » absente). */
  practitioner: { slug: string; name: string } | null;
  /** « jeudi 26 novembre 2026 ». */
  day: string;
  /** « 10:00 – 11:00 ». */
  hours: string;
  /** « heure de votre appareil, Europe/Paris ». */
  zone: string;
  /** « 60 min ». */
  duration: string;
  /** « Au cabinet ». */
  modality: string;
}

/** Fuseau IANA du navigateur ; UTC si le navigateur n'en donne pas. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function appointmentDetail(
  appointment: PublicAppointment,
  locale: string,
  timeZone: string = browserTimeZone(),
): AppointmentDetail {
  const { slug, displayName } = appointment.practitioner;
  const start = timeLabel(appointment.startsAt, timeZone, locale);
  const end = timeLabel(appointment.endsAt, timeZone, locale);
  return {
    practitioner: slug ? { slug, name: displayName ?? slug } : null,
    day: dayLabel(dateKey(appointment.startsAt, timeZone), locale, true),
    hours: `${start} – ${end}`,
    zone: $localize`:Fuseau des heures d'un rendez-vous par lien@@public.bookingLink.detail.zone:heure de votre appareil, ${timeZone}:zone:`,
    duration: $localize`:Durée d'un rendez-vous par lien@@public.bookingLink.detail.duration:${appointment.durationMin}:minutes: min`,
    modality: modalityLabel(appointment.modality),
  };
}
