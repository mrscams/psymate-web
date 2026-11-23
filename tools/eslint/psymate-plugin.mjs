// Règles ESLint propres à PsyMate.
//
// no-physical-direction : voir plus bas (M16-09).
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

// no-physical-direction : propriétés logiques seulement (G Q74, docs/design/arabe.md §2). Une
// propriété physique (margin-left, right:, text-align: left, rayon d'un coin gauche, raccourci à
// quatre valeurs dont la gauche et la droite diffèrent) ne se retourne pas en arabe. Active dans tout
// src depuis M16-29 (eslint.config.mjs), zone par zone avant. Couvre les feuilles .scss et .css, les
// styles en ligne des composants (`styles`), les gabarits (attribut style, [style.x], [style] et
// [ngStyle]), les liaisons d'hôte '[style.x]' et les écritures DOM (el.style.marginLeft, setProperty).

/** Propriétés toujours physiques, quelle que soit la valeur. */
const PHYSICAL_PROPERTY =
  /^(?:(?:scroll-)?(?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-(?:width|color|style))?|border-(?:top|bottom)-(?:left|right)-radius|left|right)$/;
/** Propriétés physiques seulement avec la valeur left ou right. */
const SIDE_VALUE_PROPERTY = /^(?:text-align|float|clear)$/;
/** Raccourcis haut, droite, bas, gauche : physiques si la droite et la gauche diffèrent. */
const FOUR_SIDE_SHORTHAND =
  /^(?:margin|padding|inset|scroll-margin|scroll-padding|border-width|border-color|border-style)$/;
/** Même liste, écrite en camelCase (CSSStyleDeclaration). */
const PHYSICAL_DOM_PROPERTY =
  /^(?:(?:scroll)?(?:Margin|margin|Padding|padding)(?:Left|Right)|border(?:Left|Right)(?:Width|Color|Style)?|border(?:Top|Bottom)(?:Left|Right)Radius|left|right)$/;

/**
 * Déclarations CSS d'un texte (feuille, style en ligne) : [index, propriété, valeur]. Une propriété
 * commence une déclaration (début de ligne, après « { » ou « ; ») ; un « nom: valeur » suivi de « { »
 * est un sélecteur (a:hover {), pas une déclaration.
 */
const DECLARATION = /(^|[{;])([ \t]*)([a-zA-Z][\w-]*)[ \t]*:[ \t]*([^;{}]*)(?=([;{}]|$))/gm;

function cssDeclarations(text) {
  const found = [];
  DECLARATION.lastIndex = 0;
  for (let m = DECLARATION.exec(text); m; m = DECLARATION.exec(text)) {
    if (m[5] === '{') continue;
    found.push([m.index + m[1].length + m[2].length, m[3].toLowerCase(), m[4]]);
  }
  return found;
}

/** Valeurs séparées par des espaces hors parenthèses ; !important retiré. */
function valueTokens(value) {
  const tokens = [];
  let depth = 0;
  let current = '';
  for (const char of value.replace(/!\s*important/i, '').trim()) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (/\s/.test(char) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Rayons haut-gauche, haut-droit, bas-droit, bas-gauche : symétriques si le miroir ne change rien. */
function symmetricRadius(tokens) {
  const [a, b = a, c = a, d = b] = tokens;
  return a === b && c === d;
}

/** Raison de la violation (« margin-left », « padding: 0 8px 0 10px »…), ou null. */
function physicalDeclaration(property, value) {
  if (PHYSICAL_PROPERTY.test(property)) return property;
  const tokens = valueTokens(value);
  if (SIDE_VALUE_PROPERTY.test(property)) {
    return /^(?:left|right)$/i.test(tokens[0] ?? '') ? `${property}: ${tokens[0]}` : null;
  }
  if (FOUR_SIDE_SHORTHAND.test(property)) {
    return tokens.length === 4 && tokens[1] !== tokens[3]
      ? `${property}: ${tokens.join(' ')}`
      : null;
  }
  if (property === 'border-radius') {
    const groups = tokens.join(' ').split('/').map(valueTokens);
    return groups.every(symmetricRadius) ? null : `${property}: ${tokens.join(' ')}`;
  }
  return null;
}

/** [index, raison] de chaque déclaration physique d'un texte CSS. */
function findPhysical(text) {
  return cssDeclarations(text)
    .map(([index, property, value]) => [index, physicalDeclaration(property, value)])
    .filter(([, reason]) => reason !== null);
}

/** Nom d'une liaison de style ([style.margin-left.px], '[style.left]') : « margin-left », ou null. */
function styleBindingProperty(raw) {
  const match = /^\[style\.([\w-]+)/i.exec(raw);
  return match ? match[1].toLowerCase() : null;
}

/** Clés et valeurs d'un objet de styles ([style]="{ 'margin-left': x }", [ngStyle]) : texte CSS. */
function styleObjectAsCss(source) {
  return source
    .replace(/^\s*\{|\}\s*$/g, '')
    .split(',')
    .map((entry) => entry.replace(/['"`]/g, '').replace(/^(\s*[\w-]+)\.\w+(\s*:)/, '$1$2'))
    .join(';');
}

const physicalMessage =
  'Propriété physique « {{reason}} » : écris-la en propriété logique (docs/design/arabe.md §2).';

const noPhysicalDirection = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Interdit les propriétés de direction physiques dans tout src (G Q74).',
    },
    schema: [],
    messages: { physical: physicalMessage },
  },
  create(context) {
    const { sourceCode } = context;
    const filename = context.filename.replace(/\\/g, '/');

    const report = (offset, reason) =>
      context.report({
        loc: sourceCode.getLocFromIndex(offset),
        messageId: 'physical',
        data: { reason },
      });
    const reportIn = (text, offset) => {
      for (const [index, reason] of findPhysical(text)) report(offset + index, reason);
    };
    const reportBinding = (raw, offset, valueSource) => {
      const property = styleBindingProperty(raw);
      if (!property) return false;
      const value = /^\s*['"`]([^'"`]*)['"`]\s*$/.exec(valueSource ?? '')?.[1] ?? '';
      const reason = physicalDeclaration(property, value);
      if (reason) report(offset, reason);
      return true;
    };

    if (/\.s?css$/.test(filename)) {
      return { Program: () => reportIn(blankScssComments(sourceCode.text), 0) };
    }

    if (filename.endsWith('.html')) {
      return {
        TextAttribute(node) {
          if (node.name === 'style') reportIn(node.value, node.valueSpan?.start.offset ?? 0);
        },
        BoundAttribute(node) {
          const start = node.sourceSpan.start.offset;
          const raw = sourceCode.text.slice(start, node.sourceSpan.end.offset);
          const source = node.value?.source;
          if (reportBinding(raw, start, source)) return;
          if (/^\[(?:style|ngStyle)\]/.test(raw) && typeof source === 'string') {
            for (const [, reason] of findPhysical(styleObjectAsCss(source))) report(start, reason);
          }
        },
      };
    }

    // TypeScript : styles en ligne d'un composant, liaisons d'hôte, écritures DOM.
    const reportStyleText = (node) => {
      if (node?.type === 'Literal' && typeof node.value === 'string') {
        reportIn(node.value, node.range[0] + 1);
      } else if (node?.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) reportIn(quasi.value.raw, quasi.range[0] + 1);
      } else if (node?.type === 'ArrayExpression') {
        node.elements.forEach(reportStyleText);
      }
    };
    const keyName = (key) => (key.type === 'Identifier' ? key.name : key.value);
    return {
      Property(node) {
        const key = keyName(node.key);
        if (key === 'styles') reportStyleText(node.value);
        else if (typeof key === 'string') reportBinding(key, node.key.range[0] + 1, null);
      },
      MemberExpression(node) {
        const object = node.object;
        const isStyle =
          object.type === 'MemberExpression' &&
          !object.computed &&
          object.property.type === 'Identifier' &&
          object.property.name === 'style';
        if (isStyle && !node.computed && PHYSICAL_DOM_PROPERTY.test(node.property.name)) {
          report(node.property.range[0], node.property.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const [first] = node.arguments;
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'setProperty' &&
          first?.type === 'Literal' &&
          typeof first.value === 'string'
        ) {
          const second = node.arguments[1];
          const value = second?.type === 'Literal' ? String(second.value) : '';
          const reason = physicalDeclaration(first.value.toLowerCase(), value);
          if (reason) report(first.range[0], reason);
        }
      },
    };
  },
};

/**
 * Analyseur minimal pour les .scss et .css : ESLint ne sait pas les lire ; on lui donne un programme
 * vide et les règles no-hardcoded-color et no-physical-direction lisent le texte brut.
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
  rules: {
    'no-hardcoded-color': noHardcodedColor,
    'no-physical-direction': noPhysicalDirection,
  },
};
