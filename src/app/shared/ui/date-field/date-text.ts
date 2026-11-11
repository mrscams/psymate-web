/**
 * Texte d'un champ date ou mois (UX-A4) : format et analyse selon la locale active, sans
 * dépendance. Les dates sont des dates civiles (minuit local) : aucun décalage de fuseau, la valeur
 * en transit est la chaîne ISO `yyyy-MM-dd` ou `yyyy-MM`, sans heure.
 */

export type DateGranularity = 'day' | 'month';

type Part = 'day' | 'month' | 'year';

/** Ordre des parties d'une date numérique pour la locale : fr → jour, mois, année ; en → mois, jour, année. */
export function datePartOrder(locale: string): Part[] {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(2003, 6, 28))
    .map((part) => part.type)
    .filter((type): type is Part => type === 'day' || type === 'month' || type === 'year');
}

/** « 28/07/2003 » (fr), « 07/28/2003 » (en) ; en mois : « 07/2003 ». */
export function formatDateText(date: Date, locale: string, granularity: DateGranularity): string {
  const options: Intl.DateTimeFormatOptions =
    granularity === 'day'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : { month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

const ISO = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/;
const SEPARATORS = /[/.\-\s]+/;

/**
 * Analyse une saisie au clavier : chiffres séparés par « / », « . », « - » ou des espaces, dans
 * l'ordre de la locale, année sur 4 chiffres ; la forme ISO est aussi acceptée (collage). Renvoie
 * null pour un texte illisible ou une date qui n'existe pas (« 31/02/2003 »).
 */
export function parseDateText(
  text: string,
  locale: string,
  granularity: DateGranularity,
): Date | null {
  const value = text.trim();
  if (!value) return null;

  const iso = ISO.exec(value);
  if (iso) {
    if (granularity === 'day' && iso[3] === undefined) return null;
    if (granularity === 'month' && iso[3] !== undefined) return null;
    return civilDate(+iso[1], +iso[2], granularity === 'day' ? +iso[3] : 1);
  }

  const pieces = value.split(SEPARATORS);
  if (!pieces.every((piece) => /^\d+$/.test(piece))) return null;

  if (granularity === 'month') {
    if (pieces.length !== 2) return null;
    const [month, year] = pieces;
    if (year.length !== 4 || month.length > 2) return null;
    return civilDate(+year, +month, 1);
  }

  const order = datePartOrder(locale);
  if (pieces.length !== 3 || order.length !== 3) return null;
  const parts: Partial<Record<Part, string>> = {};
  order.forEach((part, index) => (parts[part] = pieces[index]));
  const { day = '', month = '', year = '' } = parts;
  if (year.length !== 4 || day.length > 2 || month.length > 2) return null;
  return civilDate(+year, +month, +day);
}

/** Date civile valide (minuit local), ou null si elle n'existe pas. */
function civilDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  date.setFullYear(year);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Date civile → `yyyy-MM-dd` (jour) ou `yyyy-MM` (mois). */
export function toIsoDate(date: Date, granularity: DateGranularity): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${year}-${month}`;
  return `${year}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * `yyyy-MM-dd` ou `yyyy-MM` → date civile (minuit local, jamais `new Date(iso)` qui lirait de
 * l'UTC). Une valeur avec heure (`2026-11-11T09:00:00Z`) garde sa partie date. Null si illisible.
 */
export function fromIsoDate(
  value: string | null | undefined,
  granularity: DateGranularity,
): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value);
  if (!match) return null;
  if (granularity === 'day' && match[3] === undefined) return null;
  return civilDate(+match[1], +match[2], granularity === 'day' ? +match[3] : 1);
}
