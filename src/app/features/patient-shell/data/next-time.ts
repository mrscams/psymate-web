// « Prochaine fois » (UX-S3, proposition 04b, question 3 : une convention, pas un champ). Les
// dernières lignes d'un compte rendu de séance, introduites par « Prochaine fois : », sont les
// points à reprendre à la séance suivante. Le client les écrit à la clôture et les relit à la séance
// suivante et dans la vue d'ensemble ; le serveur n'y voit qu'un texte libre (aucun changement de
// contrat). Fonctions pures, sans texte traduit : le marqueur lui-même fait partie de la convention
// et reste identique dans les deux langues de l'interface.

/** Le marqueur, en tête de ligne, sans tenir compte de la casse ni des espaces autour du deux-points. */
const MARKER = /^\s*prochaine fois\s*:\s*(.*)$/i;

/** Puce en tête d'une ligne de la liste (celles que le panneau écrit, ou saisies à la main). */
const BULLET = /^\s*(?:[-–—•*·]|\d+[.)])\s*/;

/** Séparateur de points sur une même ligne (maquette 04b : « relire la demande ; agenda »). */
const SEPARATOR = /\s*;\s*/;

export interface SplitSummary {
  /** Le compte rendu sans le bloc « Prochaine fois » (espaces de fin retirés) ; '' s'il n'y a rien. */
  body: string;
  /** Les points à reprendre, une entrée par ligne non vide, puces retirées ; vide sans marqueur. */
  nextTime: string[];
}

/**
 * Sépare un compte rendu de ses lignes « Prochaine fois ». Le dernier marqueur de tête de ligne
 * ouvre le bloc : le reste de sa ligne (s'il y en a) puis chaque ligne non vide qui suit est un
 * point ; un « ; » sépare plusieurs points sur une ligne. Sans marqueur, tout est corps.
 */
export function splitNextTime(summary: string | null | undefined): SplitSummary {
  const lines = (summary ?? '').split(/\r?\n/);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (MARKER.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return { body: (summary ?? '').trimEnd(), nextTime: [] };
  const first = MARKER.exec(lines[start])?.[1]?.trim() ?? '';
  const items = [first, ...lines.slice(start + 1)]
    .flatMap((line) => line.split(SEPARATOR))
    .map((line) => line.replace(BULLET, '').trim())
    .filter((line) => line.length > 0);
  return { body: lines.slice(0, start).join('\n').trimEnd(), nextTime: items };
}

/**
 * Compose le compte rendu envoyé à la clôture : le texte, puis, s'il y a des points, un paragraphe
 * « Prochaine fois : » avec un point par ligne (tiret demi-cadratin). Les points vides sont ignorés.
 */
export function composeSummary(body: string, nextTime: readonly string[]): string {
  const items = nextTime.map((item) => item.trim()).filter((item) => item.length > 0);
  const text = body.trimEnd();
  if (items.length === 0) return text;
  const block = ['Prochaine fois :', ...items.map((item) => `– ${item}`)].join('\n');
  return text ? `${text}\n\n${block}` : block;
}
