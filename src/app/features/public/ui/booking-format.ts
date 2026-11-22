import { BookingModality, BookingSlot, SlotWindow } from '../data/booking.models';
import { dateKey } from '../data/booking-window';

/**
 * Libellés et formats de la prise de rendez-vous (fiche 31). Les heures sont toujours celles du
 * fuseau du praticien (`timezone` de la réponse), quelle que soit l'heure du navigateur ; Intl avec
 * la locale de l'application. Aucun créneau n'est calculé ici : on ne fait que les afficher.
 */

/** Modalité en clair, en tête de phrase (« Au cabinet », « En visio », « Par téléphone »). */
export function modalityLabel(modality: BookingModality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité d'un rendez-vous en ligne@@public.booking.modality.inPerson:Au cabinet`;
    case 'video':
      return $localize`:Modalité d'un rendez-vous en ligne@@public.booking.modality.video:En visio`;
    case 'phone':
      return $localize`:Modalité d'un rendez-vous en ligne@@public.booking.modality.phone:Par téléphone`;
  }
}

/** Modalité dans une phrase (« au cabinet »). */
export function modalityInline(modality: BookingModality, locale: string): string {
  return modalityLabel(modality).toLocaleLowerCase(locale);
}

/** « Au cabinet ou en visio » : les modalités offertes, dans l'ordre du contrat. */
export function modalitiesSentence(modalities: BookingModality[], locale: string): string {
  if (!modalities.length) return '';
  const [first, ...rest] = modalities;
  const words = [modalityLabel(first), ...rest.map((m) => modalityInline(m, locale))];
  return new Intl.ListFormat(locale, { type: 'disjunction' }).format(words);
}

/** Midi UTC d'un jour calendaire : son nom ne dépend d'aucun fuseau. */
function calendarDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** « 1er » en français pour le premier du mois (maquette 31 : « mardi 1er décembre »). */
function withOrdinal(parts: Intl.DateTimeFormatPart[], locale: string): string {
  const french = locale.toLowerCase().startsWith('fr');
  return parts
    .map((part) => (french && part.type === 'day' && part.value === '1' ? '1er' : part.value))
    .join('');
}

/** « mardi 24 novembre » (avec l'année : « jeudi 26 novembre 2026 ») d'un jour AAAA-MM-JJ. */
export function dayLabel(day: string, locale: string, withYear = false): string {
  const format = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
  return withOrdinal(format.formatToParts(calendarDate(day)), locale);
}

/** « 10:00 » : heure d'un instant dans le fuseau du praticien. */
export function timeLabel(instant: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(instant));
}

/** « Europe/Paris (heure normale d’Europe centrale) » : le fuseau nommé en toutes lettres. */
export function zoneLabel(timeZone: string, locale: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'long' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    return name ? `${timeZone} (${name})` : timeZone;
  } catch {
    return timeZone;
  }
}

/** Décalage d'un fuseau à un instant (« GMT+01:00 »). */
function offsetAt(timeZone: string, at: Date): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''
  );
}

/**
 * Fuseau nommé d'une fenêtre de créneaux. Si le décalage change entre le premier et le dernier jour
 * (passage à l'heure d'été ou d'hiver), le nom générique (« heure d’Europe centrale »), sinon le nom
 * du jour (« heure normale d’Europe centrale »).
 */
export function windowZoneLabel(timeZone: string, locale: string, window: SlotWindow): string {
  const first = new Date(`${window.from}T12:00:00Z`);
  const last = new Date(`${window.to}T12:00:00Z`);
  try {
    if (offsetAt(timeZone, first) === offsetAt(timeZone, last)) {
      return zoneLabel(timeZone, locale, first);
    }
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(first)
      .find((part) => part.type === 'timeZoneName')?.value;
    return name ? `${timeZone} (${name})` : timeZone;
  } catch {
    return timeZone;
  }
}

/** « Du lundi 23 novembre au dimanche 6 décembre 2026 » (l'année au début aussi si elle change). */
export function periodLabel(window: SlotWindow, locale: string): string {
  const sameYear = window.from.slice(0, 4) === window.to.slice(0, 4);
  const from = dayLabel(window.from, locale, !sameYear);
  const to = dayLabel(window.to, locale, true);
  return $localize`:Période des créneaux affichés@@public.booking.period:Du ${from}:from: au ${to}:to:`;
}

/** Un créneau prêt à afficher. */
export interface SlotView {
  slot: BookingSlot;
  start: string;
  end: string;
  /** Nom accessible : « mardi 24 novembre, 16:00 à 17:00 ». */
  label: string;
}

/** Les créneaux d'un jour. */
export interface SlotDay {
  key: string;
  label: string;
  slots: SlotView[];
}

/** « mardi 24 novembre, 16:00 à 17:00 ». */
export function slotAccessibleName(day: string, start: string, end: string): string {
  return $localize`:Nom accessible d'un créneau@@public.booking.slot.label:${day}:day:, ${start}:start: à ${end}:end:`;
}

/**
 * Regroupe les créneaux par jour du fuseau du praticien, dans l'ordre de l'API ; seuls les jours
 * qui ont au moins un créneau apparaissent.
 */
export function groupByDay(slots: BookingSlot[], timeZone: string, locale: string): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const slot of slots) {
    const key = dateKey(slot.startsAt, timeZone);
    let day = days.get(key);
    if (!day) {
      day = { key, label: dayLabel(key, locale), slots: [] };
      days.set(key, day);
    }
    const start = timeLabel(slot.startsAt, timeZone, locale);
    const end = timeLabel(slot.endsAt, timeZone, locale);
    day.slots.push({ slot, start, end, label: slotAccessibleName(day.label, start, end) });
  }
  return [...days.values()];
}

/** Rappel d'un créneau : « jeudi 26 novembre 2026 » et « 10:00 – 11:00 ». */
export function slotRecap(
  slot: BookingSlot,
  timeZone: string,
  locale: string,
): { day: string; hours: string } {
  return {
    day: dayLabel(dateKey(slot.startsAt, timeZone), locale, true),
    hours: `${timeLabel(slot.startsAt, timeZone, locale)} – ${timeLabel(slot.endsAt, timeZone, locale)}`,
  };
}

/** Minutes d'attente d'un 429, arrondies à la minute supérieure (au moins 1). */
export function retryMinutes(seconds: number | undefined | null): number {
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}
