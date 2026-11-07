/** Un morceau de texte, en gras ou non (« **important** »). */
export interface BioSpan {
  text: string;
  strong: boolean;
}

/** Un bloc de la présentation : paragraphe, ou liste à puces (lignes « - » ou « * »). */
export type BioBlock =
  { kind: 'paragraph'; spans: BioSpan[] } | { kind: 'list'; items: BioSpan[][] };

const BULLET = /^\s*[-*•]\s+/;

/**
 * Présentation d'un praticien en Markdown restreint (fiche 09 : paragraphes, gras, listes ; pas
 * de lien). Rendue par le gabarit, jamais en innerHTML : le texte du praticien reste du texte.
 */
export function parseBio(bio: string | null): BioBlock[] {
  if (!bio?.trim()) return [];
  const blocks: BioBlock[] = [];
  for (const chunk of bio.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((line) => line.trim());
    if (!lines.length) continue;
    if (lines.every((line) => BULLET.test(line))) {
      blocks.push({ kind: 'list', items: lines.map((line) => spans(line.replace(BULLET, ''))) });
    } else {
      blocks.push({ kind: 'paragraph', spans: spans(lines.map((line) => line.trim()).join(' ')) });
    }
  }
  return blocks;
}

function spans(text: string): BioSpan[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), strong: true }
        : { text: part, strong: false },
    );
}

/** Extrait d'une présentation en texte simple (fiche résumée) : sans puces ni astérisques de gras. */
export function plainText(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\n)\s*[-*•]\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
