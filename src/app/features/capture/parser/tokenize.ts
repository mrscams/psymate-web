// Découpe de la saisie en jetons : mots (séparés par des espaces), passages entre guillemets (texte
// littéral, jamais interprété) et chevrons `>` hors guillemets (lien vers une entrée).

export type TokenKind = 'word' | 'quote' | 'gt';

export interface Token {
  readonly kind: TokenKind;
  /** Texte tel que saisi (guillemets compris pour un passage cité). */
  readonly raw: string;
  /** Contenu sans les guillemets pour un passage cité ; égal à `raw` sinon. */
  readonly content: string;
  /** Un espace précédait le jeton dans la saisie. */
  readonly spaceBefore: boolean;
  /** Faux seulement pour un passage cité sans guillemet fermant. */
  readonly closed: boolean;
}

export interface UnclosedQuote {
  readonly quote: string;
  /** Position du guillemet ouvrant dans la saisie. */
  readonly index: number;
}

export interface Tokenized {
  readonly tokens: readonly Token[];
  readonly unclosed?: UnclosedQuote;
}

/** Guillemet ouvrant → guillemet fermant. L'apostrophe n'en est pas un (« n'a », « aujourd'hui »). */
const QUOTES = new Map<string, string>([
  ['"', '"'],
  ['«', '»'],
  ['“', '”'],
]);

const SPACE = /\s/;

export function tokenize(input: string): Tokenized {
  const tokens: Token[] = [];
  let unclosed: UnclosedQuote | undefined;
  let word = '';
  let wordSpace = false;
  let space = false;

  const flush = (): void => {
    if (word)
      tokens.push({ kind: 'word', raw: word, content: word, spaceBefore: wordSpace, closed: true });
    word = '';
  };

  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (SPACE.test(char)) {
      flush();
      space = true;
      i++;
      continue;
    }
    const close = QUOTES.get(char);
    if (close !== undefined) {
      flush();
      const end = input.indexOf(close, i + 1);
      const stop = end < 0 ? input.length : end + 1;
      if (end < 0) unclosed = { quote: char, index: i };
      tokens.push({
        kind: 'quote',
        raw: input.slice(i, stop),
        content: input.slice(i + 1, end < 0 ? input.length : end),
        spaceBefore: space,
        closed: end >= 0,
      });
      space = false;
      i = stop;
      continue;
    }
    if (char === '>') {
      flush();
      tokens.push({ kind: 'gt', raw: char, content: char, spaceBefore: space, closed: true });
      space = false;
      i++;
      continue;
    }
    if (!word) wordSpace = space;
    word += char;
    space = false;
    i++;
  }
  flush();
  return unclosed ? { tokens, unclosed } : { tokens };
}

/**
 * Recompose une suite de jetons : un espace entre deux jetons gardés quand la saisie en avait un, ou
 * quand un jeton retiré les séparait. `quoteContent` rend un passage cité sans ses guillemets.
 */
export function render(
  tokens: readonly Token[],
  keep: (index: number) => boolean,
  quoteContent = false,
): string {
  let out = '';
  let gap = false;
  tokens.forEach((token, index) => {
    if (!keep(index)) {
      gap = true;
      return;
    }
    const piece = quoteContent && token.kind === 'quote' ? token.content.trim() : token.raw;
    if (out && (token.spaceBefore || gap)) out += ' ';
    out += piece;
    gap = false;
  });
  return out.trim();
}
