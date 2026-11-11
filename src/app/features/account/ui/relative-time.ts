/** Rafraîchissement des textes « il y a n s » des pages de Mon compte. */
export const RELATIVE_TICK_MS = 5_000;

/**
 * « à l'instant » sous 5 s, puis « il y a 12 s », « il y a 3 min », « il y a 2 h », « il y a 4 j »
 * (Intl, forme courte, locale de l'application). Indicateurs d'enregistrement (fiches 10, 14) et
 * dernière activité des sessions (fiche 18).
 */
export function relativeAgo(at: number, now: number, locale: string): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) {
    return $localize`:Enregistré il y a moins de 5 secondes@@profile.save.justNow:à l'instant`;
  }
  const format = new Intl.RelativeTimeFormat(locale, { style: 'short', numeric: 'auto' });
  if (seconds < 60) return format.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}
