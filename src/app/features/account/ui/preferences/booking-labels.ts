import {
  BOOKING_HORIZON_DAYS_MAX,
  BOOKING_HORIZON_DAYS_MIN,
  BOOKING_MIN_NOTICE_HOURS_MAX,
  BOOKING_MIN_NOTICE_HOURS_MIN,
  BOOKING_MINUTE_STEP,
  BOOKING_SLOT_DURATION_MAX,
  BOOKING_SLOT_DURATION_MIN,
  BookingModality,
} from '../../../../core/preferences';
import { WeekDay, WindowFault } from './booking-windows';

/** Nom d'un jour : en titre (« Lundi ») et dans une phrase (« du lundi »). */
export interface DayLabel {
  title: string;
  inline: string;
}

export const DAY_LABELS: Record<WeekDay, DayLabel> = {
  1: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.1.title:Lundi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.1.inline:lundi`,
  },
  2: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.2.title:Mardi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.2.inline:mardi`,
  },
  3: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.3.title:Mercredi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.3.inline:mercredi`,
  },
  4: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.4.title:Jeudi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.4.inline:jeudi`,
  },
  5: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.5.title:Vendredi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.5.inline:vendredi`,
  },
  6: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.6.title:Samedi`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.6.inline:samedi`,
  },
  7: {
    title: $localize`:Jour, titre d'une ligne de plages@@preferences.booking.day.7.title:Dimanche`,
    inline: $localize`:Jour, dans une phrase (du …)@@preferences.booking.day.7.inline:dimanche`,
  },
};

export function dayGroupLabel(day: WeekDay): string {
  const name = DAY_LABELS[day].inline;
  return $localize`:Nom du groupe des plages d'un jour@@preferences.booking.day.group:Plages du ${name}:day:`;
}

export function startLabel(day: WeekDay, index: number): string {
  const name = DAY_LABELS[day].inline;
  return $localize`:Nom du champ Début d'une plage@@preferences.booking.window.start:Début de la plage ${index}:index: du ${name}:day:`;
}

export function endLabel(day: WeekDay, index: number): string {
  const name = DAY_LABELS[day].inline;
  return $localize`:Nom du champ Fin d'une plage@@preferences.booking.window.end:Fin de la plage ${index}:index: du ${name}:day:`;
}

export function removeLabel(day: WeekDay, start: string, end: string): string {
  const name = DAY_LABELS[day].inline;
  return $localize`:Nom du bouton qui retire une plage@@preferences.booking.window.remove:Retirer la plage du ${name}:day:, ${start}:start: à ${end}:end:`;
}

export function faultMessage(fault: WindowFault): string {
  switch (fault) {
    case 'format':
      return $localize`:Erreur de plage, heure mal formée@@preferences.booking.window.error.format:Heure attendue au format HH:MM, minutes de 5 en 5.`;
    case 'order':
      return $localize`:Erreur de plage, fin avant le début@@preferences.booking.window.error.order:La fin doit être après le début.`;
    case 'overlap':
      return $localize`:Erreur de plage, chevauchement@@preferences.booking.window.error.overlap:Cette plage chevauche une autre plage du même jour.`;
  }
}

/** Réglages numériques de la section : clé, bornes, pas, et leurs textes. */
export type BookingNumberKey =
  'booking.slotDurationMin' | 'booking.minNoticeHours' | 'booking.horizonDays';

export interface NumberSetting {
  key: BookingNumberKey;
  id: string;
  min: number;
  max: number;
  step: number;
  label: string;
  help: string;
  unit: string;
  rangeError: string;
}

export function numberSettings(): NumberSetting[] {
  const slotMin = BOOKING_SLOT_DURATION_MIN;
  const slotMax = BOOKING_SLOT_DURATION_MAX;
  const step = BOOKING_MINUTE_STEP;
  const noticeMin = BOOKING_MIN_NOTICE_HOURS_MIN;
  const noticeMax = BOOKING_MIN_NOTICE_HOURS_MAX;
  const horizonMin = BOOKING_HORIZON_DAYS_MIN;
  const horizonMax = BOOKING_HORIZON_DAYS_MAX;
  return [
    {
      key: 'booking.slotDurationMin',
      id: 'booking-duration',
      min: slotMin,
      max: slotMax,
      step,
      label: $localize`:Réglage de la durée d'un créneau en ligne@@preferences.booking.duration.label:Durée d'un créneau`,
      help: $localize`:Aide de la durée d'un créneau@@preferences.booking.duration.help:De ${slotMin}:min: à ${slotMax}:max: minutes, par pas de ${step}:step:.`,
      unit: $localize`:Unité minutes@@preferences.booking.duration.unit:min`,
      rangeError: $localize`:Erreur, durée d'un créneau hors bornes@@preferences.booking.duration.error:Entre ${slotMin}:min: et ${slotMax}:max:, par pas de ${step}:step:.`,
    },
    {
      key: 'booking.minNoticeHours',
      id: 'booking-notice',
      min: noticeMin,
      max: noticeMax,
      step: 1,
      label: $localize`:Réglage du délai minimal@@preferences.booking.notice.label:Délai minimal`,
      help: $localize`:Aide du délai minimal@@preferences.booking.notice.help:Temps entre la demande et le début du créneau, de ${noticeMin}:min: à ${noticeMax}:max: heures.`,
      unit: $localize`:Unité heures@@preferences.booking.notice.unit:h`,
      rangeError: $localize`:Erreur, délai minimal hors bornes@@preferences.booking.notice.error:Entre ${noticeMin}:min: et ${noticeMax}:max:.`,
    },
    {
      key: 'booking.horizonDays',
      id: 'booking-horizon',
      min: horizonMin,
      max: horizonMax,
      step: 1,
      label: $localize`:Réglage de l'horizon@@preferences.booking.horizon.label:Horizon`,
      help: $localize`:Aide de l'horizon@@preferences.booking.horizon.help:Aucun créneau n'est proposé au-delà, de ${horizonMin}:min: à ${horizonMax}:max: jours.`,
      unit: $localize`:Unité jours@@preferences.booking.horizon.unit:jours`,
      rangeError: $localize`:Erreur, horizon hors bornes@@preferences.booking.horizon.error:Entre ${horizonMin}:min: et ${horizonMax}:max:.`,
    },
  ];
}

export function modalityLabel(modality: BookingModality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité au cabinet@@preferences.booking.modality.in_person:Au cabinet`;
    case 'video':
      return $localize`:Modalité en visio@@preferences.booking.modality.video:En visio`;
    case 'phone':
      return $localize`:Modalité par téléphone@@preferences.booking.modality.phone:Par téléphone`;
  }
}
