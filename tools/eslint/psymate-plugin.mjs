// Règles ESLint propres à PsyMate.
//
// no-hardcoded-color : aucune couleur écrite en dur dans src/app (étude couleurs §8, handbook §11 règle 9).
// Les couleurs vivent dans src/theme/tokens.css ; les composants n'utilisent que var(--token)
// ou var(--mat-sys-*). Couvre les .ts (chaînes et gabarits, donc les styles en ligne),
// les gabarits .html et les feuilles .scss des composants.

const HEX = /(?<![\w&$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.][^)]*\)/g;

/** Retourne [index, valeur] de chaque couleur trouvée dans le texte. */
function findColors(text) {
  const found = [];
  for (const re of [HEX, COLOR_FUNCTION]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      found.push([m.index, m[0]]);
    }
  }
  return found;
}

/** Remplace les commentaires CSS / SCSS par des espaces (les positions restent justes). */
function blankScssComments(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_, before, comment) => before + blank(comment));
}

const message =
  'Couleur en dur « {{color}} » : utilise un token de src/theme/tokens.css (var(--…)) ou var(--mat-sys-…).';

const noHardcodedColor = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Interdit toute couleur hexadécimale ou fonctionnelle en dur dans src/app.',
    },
    schema: [],
    messages: { hardcoded: message },
  },
  create(context) {
    const { sourceCode } = context;
    const filename = context.filename.replace(/\\/g, '/');

    const reportIn = (text, offset) => {
      for (const [index, color] of findColors(text)) {
        context.report({
          loc: sourceCode.getLocFromIndex(offset + index),
          messageId: 'hardcoded',
          data: { color },
        });
      }
    };

    // Feuilles de style : analysées comme du texte (voir scssTextParser).
    if (/\.s?css$/.test(filename)) {
      return { Program: () => reportIn(blankScssComments(sourceCode.text), 0) };
    }

    // Gabarits Angular (@angular-eslint/template-parser) : valeurs d'attributs, liaisons et texte.
    // Les références de gabarit (#ref) sont des nœuds Reference, donc jamais analysées.
    if (filename.endsWith('.html')) {
      const offsetOf = (node) => node.valueSpan?.start.offset ?? node.sourceSpan?.start.offset;
      return {
        TextAttribute(node) {
          reportIn(node.value, offsetOf(node) ?? 0);
        },
        BoundAttribute(node) {
          const source = node.value?.source;
          if (typeof source === 'string') reportIn(source, offsetOf(node) ?? 0);
        },
        BoundText(node) {
          const source = node.value?.source;
          if (typeof source === 'string') reportIn(source, node.sourceSpan.start.offset);
        },
      };
    }

    // TypeScript : littéraux de chaîne et morceaux de gabarits (styles et templates en ligne).
    return {
      Literal(node) {
        if (typeof node.value === 'string') reportIn(node.raw, node.range[0]);
      },
      TemplateElement(node) {
        reportIn(node.value.raw, node.range[0] + 1);
      },
    };
  },
};

/**
 * Analyseur minimal pour les .scss : ESLint ne sait pas lire le SCSS ; on lui donne un programme vide
 * et la règle no-hardcoded-color lit le texte brut.
 */
export const scssTextParser = {
  meta: { name: 'psymate-scss-text' },
  parseForESLint(code) {
    const lines = code.split('\n');
    return {
      ast: {
        type: 'Program',
        body: [],
        sourceType: 'module',
        comments: [],
        tokens: [],
        range: [0, code.length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: lines.length, column: lines.at(-1).length },
        },
      },
      visitorKeys: { Program: [] },
    };
  },
};

export default {
  meta: { name: 'psymate' },
  rules: { 'no-hardcoded-color': noHardcodedColor },
};
