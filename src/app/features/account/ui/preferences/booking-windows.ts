import { BOOKING_MINUTE_STEP, BookingWindow } from '../../../../core/preferences';

/** Jour d'une plage : 1 (lundi) à 7 (dimanche), comme `booking.windows` du contrat. */
export type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEK_DAYS: readonly WeekDay[] = [1, 2, 3, 4, 5, 6, 7];

/** Une plage en cours d'édition : le texte saisi tel quel, et une clé stable pour le rendu. */
export interface DraftWindow {
  key: number;
  day: WeekDay;
  start: string;
  end: string;
}

/** Faute de forme d'une plage (fiche 14, « Enregistrement »). */
export type WindowFault = 'format' | 'order' | 'overlap';

/** `HH:MM` de 00:00 à 23:59 ; le pas des minutes est vérifié à part. */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Heure au format `HH:MM`, minutes multiples de `BOOKING_MINUTE_STEP`. */
export function isWindowTime(value: string): boolean {
  const match = TIME.exec(value);
  return match !== null && Number(match[2]) % BOOKING_MINUTE_STEP === 0;
}

/**
 * Faute de chaque plage, par clé : format d'abord, puis fin avant début, puis chevauchement avec une
 * plage bien formée placée avant elle le même jour (contiguës admises : 09:00–12:00 puis 12:00–14:00).
 */
export function windowFaults(drafts: readonly DraftWindow[]): Map<number, WindowFault> {
  const faults = new Map<number, WindowFault>();
  const accepted: DraftWindow[] = [];
  for (const draft of drafts) {
    if (!isWindowTime(draft.start) || !isWindowTime(draft.end)) {
      faults.set(draft.key, 'format');
    } else if (draft.end <= draft.start) {
      faults.set(draft.key, 'order');
    } else if (
      accepted.some(
        (other) => other.day === draft.day && other.start < draft.end && draft.start < other.end,
      )
    ) {
      faults.set(draft.key, 'overlap');
    } else {
      accepted.push(draft);
    }
  }
  return faults;
}

/** Ordre du serveur : par jour, puis par début. */
export function sortWindows(windows: readonly BookingWindow[]): BookingWindow[] {
  return [...windows].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

/** Les plages à envoyer : le texte saisi, triées comme le serveur les renvoie. */
export function toWindows(drafts: readonly DraftWindow[]): BookingWindow[] {
  return sortWindows(drafts.map(({ day, start, end }) => ({ day, start, end })));
}

/** Deux listes de plages identiques, à l'ordre près. */
export function sameWindows(a: readonly BookingWindow[], b: readonly BookingWindow[]): boolean {
  if (a.length !== b.length) return false;
  const left = sortWindows(a);
  const right = sortWindows(b);
  return left.every(
    (window, index) =>
      window.day === right[index].day &&
      window.start === right[index].start &&
      window.end === right[index].end,
  );
}
