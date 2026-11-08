/**
 * « il y a 18 min », « il y a 2 h », « il y a 3 j » (Intl.RelativeTimeFormat, style court) : depuis
 * la création ou la dernière version, pour le bandeau de grâce.
 */
export function relativeAgo(iso: string | null, locale: string, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return format.format(-hours, 'hour');
  return format.format(-Math.floor(hours / 24), 'day');
}
