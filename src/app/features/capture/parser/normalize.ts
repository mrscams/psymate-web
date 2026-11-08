// Normalisation des mots de la barre de commande : comparaison sans casse ni accents, ponctuation de
// bord retirée. Fonctions déterministes : toLowerCase et normalize('NFD') ne dépendent pas de la
// locale de la machine.

/** Langue de grammaire des dates ; toute locale autre que l'anglais lit la grammaire française. */
export type GrammarLanguage = 'fr' | 'en';

const COMBINING_MARKS = /\p{M}/gu;
const APOSTROPHES = /[’ʼ`´]/g;
const EDGE_PUNCTUATION = /^[.,;:!?()[\]{}…»”]+|[.,;:!?()[\]{}…»”]+$/g;
const ELISION = /^[ld]'/;
const SPACES = /\s+/g;
const ENGLISH: ReadonlySet<string> = new Set(['en', 'eng']);

/** Minuscules, sans accents, apostrophes typographiques ramenées à « ' ». */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, "'");
}

/** Retire la ponctuation collée au début ou à la fin d'un mot (« hier, » → « hier »). */
export function stripPunctuation(raw: string): string {
  return raw.replace(EDGE_PUNCTUATION, '');
}

/** Forme de comparaison d'un mot saisi. */
export function foldWord(raw: string): string {
  return fold(stripPunctuation(raw));
}

/** Forme de comparaison d'un mot de date : élision retirée (« l'été » → « ete »). */
export function foldDateWord(raw: string): string {
  return foldWord(raw).replace(ELISION, '');
}

/** Forme de comparaison d'un libellé ou d'un code d'émotion (espaces internes ramenés à un seul). */
export function foldLabel(label: string): string {
  return fold(label).trim().replace(SPACES, ' ');
}

/** Retire l'élision d'un mot tel que saisi, pour un libellé (« l'été » → « été »). */
export function stripElision(raw: string): string {
  return raw.replace(APOSTROPHES, "'").replace(/^[lLdD]'/, '');
}

/** Sous-étiquette de langue : « en », « en-GB », « eng » → en ; « fr », « fr-FR », « de », « enfr » → fr. */
export function grammarLanguage(locale: string): GrammarLanguage {
  const language = fold(locale.trim()).split(/[-_]/)[0];
  return ENGLISH.has(language) ? 'en' : 'fr';
}
