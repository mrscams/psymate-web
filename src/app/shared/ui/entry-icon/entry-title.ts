import { EntryType, entryTypeLabel } from './entry-icon.component';

/** Longueur de l'extrait qui nomme une entrée sans titre (comme la phrase des liens du serveur). */
export const ENTRY_TITLE_EXCERPT = 60;

/**
 * Forme minimale d'une entrée à nommer : chaque feature y projette son modèle (EntryDto, nœud du
 * graphe, item de timeline, résultat de recherche…) sans dépendre du client généré.
 */
export interface EntryTitleSource {
  type: EntryType;
  title?: string | null;
  /** Texte libre (corps, extrait ou description) ; espaces et retours à la ligne sont repliés. */
  text?: string | null;
  /** Moment de l'entrée (ISO UTC en transit), début de la plage si c'en est une. */
  occurred?: string | Date | null;
  /** Ressenti : libellé de l'émotion déjà traduit par l'appelant (« Anxiété »). */
  emotion?: string | null;
  /** Ressenti : intensité sur 10. */
  intensity?: number | null;
}

export interface EntryTitleOptions {
  /**
   * Fuseau de lecture de la date ; par défaut celui du navigateur. Passer `'UTC'` pour une entrée
   * de précision jour, mois, année ou période (bornes en jours entiers UTC, comme formatOccurred).
   */
  timeZone?: string;
  /** Instant de référence : l'année n'est écrite que si elle diffère de celle de `now`. */
  now?: Date;
}

/**
 * Titre lisible d'une entrée, partout où elle est nommée dans une liste (vue d'ensemble, timeline,
 * sélecteur du graphe, rail, recherche) :
 * 1. son titre, s'il existe ;
 * 2. sinon les 60 premiers caractères de son texte, coupés au mot, avec « … » ;
 * 3. sinon, pour un ressenti dont on connaît l'émotion, « Anxiété 6/10 · 24 oct. » ;
 * 4. sinon le libellé de son type et sa date courte : « Note · 24 oct. » (l'année seulement si ce
 *    n'est pas l'année en cours), ou le libellé seul sans date.
 */
export function entryTitle(
  entry: EntryTitleSource,
  locale: string,
  options: EntryTitleOptions = {},
): string {
  const title = collapse(entry.title);
  if (title) return title;

  const text = collapse(entry.text);
  if (text) return excerpt(text, ENTRY_TITLE_EXCERPT);

  const label = typeName(entry);
  const date = shortDate(entry.occurred, locale, options);
  if (!date) return label;
  return $localize`:Titre de repli d'une entrée sans titre ni texte, type et date courte (« Note · 24 oct. »)@@entry.title.typeDate:${label}:label: · ${date}:date:`;
}

/** Libellé du type, ou « Anxiété 6/10 » pour un ressenti dont l'émotion est connue. */
function typeName(entry: EntryTitleSource): string {
  const emotion = entry.type === 'feeling' ? collapse(entry.emotion) : '';
  if (!emotion) return entryTypeLabel(entry.type);
  const intensity = entry.intensity;
  if (intensity === null || intensity === undefined || !Number.isFinite(intensity)) return emotion;
  return $localize`:Nom d'un ressenti sans titre, émotion et intensité sur 10 (« Anxiété 6/10 »)@@entry.title.feeling:${emotion}:emotion: ${intensity}:intensity:/10`;
}

/** Espaces, tabulations et retours à la ligne ramenés à une espace ; bords retirés. */
function collapse(value: string | null | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Les `max` premiers caractères, coupés au dernier mot entier, sans ponctuation pendante, suivis de
 * « … ». Un mot unique plus long que `max` est coupé net.
 */
function excerpt(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  // Un caractère de plus : si c'est une espace, la coupe à `max` tombe déjà entre deux mots.
  const head = chars.slice(0, max + 1).join('');
  const space = head.lastIndexOf(' ');
  const cut = space > 0 ? head.slice(0, space) : chars.slice(0, max).join('');
  return `${cut.replace(/[\s,;:.!?…\-–—]+$/u, '')}…`;
}

/** « 24 oct. » (fr), « Oct 24 » (en) ; avec l'année hors de l'année en cours. */
function shortDate(
  value: string | Date | null | undefined,
  locale: string,
  options: EntryTitleOptions,
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timeZone = options.timeZone;
  const year = (d: Date): string =>
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone }).format(d);
  const withYear = year(date) !== year(options.now ?? new Date());
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone,
  }).format(date);
}
