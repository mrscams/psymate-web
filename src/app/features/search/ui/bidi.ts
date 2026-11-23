// Sens d'écriture des valeurs saisies insérées dans un texte de l'écran de recherche (G Q77,
// docs/design/arabe.md §5). Même technique que features/agenda (ui/agenda-format.ts) et
// features/capture : une feature n'importe pas l'intérieur d'une autre, d'où ce doublon.

import { textDirection } from '../../../core/i18n';

/** Une lettre d'une écriture de droite à gauche (hébreu, arabe, syriaque, thaana, formes A et B). */
export const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Le texte contient au moins une lettre de droite à gauche. */
export function hasRtlLetter(text: string): boolean {
  return RTL_LETTER.test(text);
}

/**
 * Valeur saisie insérée dans une phrase assemblée en TypeScript (synthèse, titre de l'état vide,
 * annonce aria-live), où un `<bdi>` est impossible : isolée par U+2068 … U+2069 (sens de la valeur).
 * En arabe, toujours ; en français et en anglais, seulement une valeur qui contient une lettre de
 * droite à gauche : une valeur en lettres latines y reste inchangée, caractère pour caractère.
 * Pour l'affichage seulement : rien d'isolé ne part vers l'API, une URL ou une comparaison.
 */
export function isolate(value: string, locale: string): string {
  if (!value) return value;
  if (textDirection(locale) !== 'rtl' && !hasRtlLetter(value)) return value;
  return `⁨${value}⁩`;
}
