// Surlignage des correspondances du filtre (fiche 01 : --search-highlight).

import { normalizeText } from '../data/patient.model';

/** Découpe un nom en morceaux surlignés ou non selon la recherche (accents et casse ignorés). */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const needle = normalizeText(query.trim());
  if (!needle) return [{ text, match: false }];
  // Normalise caractère par caractère pour garder la correspondance avec le texte d'origine.
  const chars = [...text];
  const normalized: string[] = [];
  const origin: number[] = [];
  chars.forEach((char, index) => {
    for (const piece of normalizeText(char)) {
      normalized.push(piece);
      origin.push(index);
    }
  });
  const haystack = normalized.join('');
  const marks = new Array<boolean>(chars.length).fill(false);
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    for (let i = from; i < from + needle.length; i++) marks[origin[i]] = true;
    from = haystack.indexOf(needle, from + needle.length);
  }
  const parts: { text: string; match: boolean }[] = [];
  chars.forEach((char, index) => {
    const last = parts.at(-1);
    if (last && last.match === marks[index]) last.text += char;
    else parts.push({ text: char, match: marks[index] });
  });
  return parts;
}
