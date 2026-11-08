#!/usr/bin/env node
// pnpm check:tokens : test de non-régression de la palette (étude couleurs §8).
//
// Lit src/theme/tokens.css, reconstitue chaque thème (clair = :root ; sombre et doux = :root
// surchargé par [data-theme]) et vérifie :
// 1. le rapport de contraste WCAG 2.1 de chaque couple déclaré ci-dessous, sur les trois thèmes :
//    échec sous 4,5:1 pour du texte et 3:1 pour une icône ou un élément graphique ;
// 2. la couverture des thèmes : le sombre redéfinit chaque couleur de :root (sinon une valeur claire,
//    pensée pour un fond blanc, s'afficherait sur un fond foncé), sauf la liste blanche SAME_IN_ALL ;
//    le doux ne redéfinit que SOFT_ONLY (étude §6 : « rien d'autre ne change »).
//
// Ajouter un couple ici quand un nouvel usage apparaît ; ne jamais retoucher une couleur de
// tokens.css pour faire passer ce test sans décision écrite (G-decisions ou étude couleurs). Une
// valeur de l'étude sous le seuil n'est pas corrigée en douce : elle devient une exception (`waiver`)
// avec sa raison et un plancher (`floor`, le rapport actuel arrondi par défaut), affichée à chaque
// exécution ; le test échoue si le rapport passe sous le plancher ou si l'exception n'a plus lieu
// d'être. Ces exceptions attendent une décision écrite (étude §7 ou G-decisions).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/theme/tokens.css', import.meta.url));
const MIN = { text: 4.5, icon: 3 };
const THEMES = ['light', 'dark', 'soft'];
const LIGHT_THEMES = ['light', 'soft'];

/** Tokens volontairement identiques dans les trois thèmes (jamais redéfinis en sombre). */
const SAME_IN_ALL = {
  'admin-bar-bg': 'barre d’administration, fiche 00 §5 : mêmes valeurs dans les trois thèmes',
  'admin-bar-text': 'barre d’administration, fiche 00 §5',
  'admin-bar-text-muted': 'barre d’administration, fiche 00 §5',
  'admin-bar-border': 'barre d’administration, fiche 00 §5',
  'font-ui': 'police, pas une couleur',
  'font-mono': 'police, pas une couleur',
};

/** Les seuls tokens que le contraste doux redéfinit (étude §6). */
const SOFT_ONLY = ['surface-ground', 'border-subtle'];

const STUDY_EMOTIONS =
  'valeur claire de l’étude §4 (familles à valider avec les praticiens pilotes) ; la pastille porte ' +
  'toujours l’icône et le libellé de la famille (étude §4, §7 « Daltonisme »), la couleur ne porte ' +
  'pas seule l’information';

/**
 * Couples déclarés : [premier plan, fond, nature, options]. Options : `only` (thèmes concernés, tous
 * par défaut) ; `waiver` ({ themes, reason }) : sous le seuil dans ces thèmes, exception documentée.
 * Sources : étude §7 (contrastes vérifiés), §6 (mode sombre), §3-§5 (règles d'emploi), et les usages
 * réels du code (grep « color: var(--x) » et « background: var(--y) »).
 */
const PAIRS = [
  // Texte sur les surfaces
  ['text-primary', 'surface-raised', 'text'],
  ['text-primary', 'surface-ground', 'text'],
  ['text-primary', 'surface-sunken', 'text'],
  ['text-secondary', 'surface-raised', 'text'],
  ['text-secondary', 'surface-ground', 'text'],
  // Métadonnées sur chips neutres et pistes (surface-sunken)
  ['text-secondary', 'surface-sunken', 'text'],
  // Surlignage de recherche (pm-marked-text, liste des patients) : texte principal sur ambre
  ['text-primary', 'search-highlight', 'text'],

  // Primaire : bouton plein (repos et survol), liens, états actifs, bandeau d'information
  ['primary-on', 'primary', 'text'],
  ['primary-on', 'primary-hover', 'text'],
  ['primary', 'surface-raised', 'text'],
  ['primary', 'surface-ground', 'text'],
  ['primary-hover', 'primary-tint', 'text'],
  ['primary-hover', 'surface-raised', 'text'],
  ['text-primary', 'primary-tint', 'text'],

  // Ressenti : chip, curseur (valeur et poignée en feeling-text), pastille
  ['feeling-text', 'feeling-tint', 'text'],
  ['feeling-text', 'surface-raised', 'text'],
  ['feeling', 'surface-raised', 'icon'],

  // Signalétique système : texte sur son fond pâle (clair) ou sombre (sombre), et directement sur
  // une carte (messages de champ, statuts de document, règles de mot de passe…)
  ['danger', 'danger-bg', 'text'],
  ['warning', 'warning-bg', 'text'],
  ['success', 'success-bg', 'text'],
  ['info', 'info-bg', 'text'],
  ['danger', 'surface-raised', 'text'],
  ['warning', 'surface-raised', 'text'],
  ['success', 'surface-raised', 'text'],
  ['info', 'surface-raised', 'text'],
  ['text-primary', 'danger-bg', 'text'],
  ['text-primary', 'warning-bg', 'text'],
  ['text-primary', 'success-bg', 'text'],
  ['text-primary', 'info-bg', 'text'],
  // Bandeaux : métadonnées et lien (« Voir mon dossier professionnel » sur warning-bg, relevé par
  // axe-core en sombre en M6-04)
  ['text-secondary', 'danger-bg', 'text'],
  ['text-secondary', 'warning-bg', 'text'],
  ['text-secondary', 'success-bg', 'text'],
  ['text-secondary', 'info-bg', 'text'],
  ['primary', 'danger-bg', 'text'],
  ['primary', 'warning-bg', 'text'],
  ['primary', 'success-bg', 'text'],
  ['primary', 'info-bg', 'text'],
  // Bouton destructif plein
  ['danger-on', 'danger', 'text'],

  // Flag praticien : icône et bordure sur la carte et sur son fond, pastille texte warning sur flag-bg
  ['flag', 'surface-raised', 'icon'],
  [
    'flag',
    'flag-bg',
    'icon',
    {
      waiver: {
        themes: LIGHT_THEMES,
        floor: 2.85,
        reason:
          'couple de l’étude §3 (#B8862E sur #FBF1DC), seulement en bordure de la puce de flag ' +
          'choisie (flag-fields : --flag sur --warning-bg, même valeur que --flag-bg) : le libellé, ' +
          'écrit en warning (couple suivant), et aria-pressed portent l’état',
      },
    },
  ],
  ['warning', 'flag-bg', 'text'],

  // Barre d'administration (fiche 00 §5), mêmes valeurs dans les trois thèmes ; flag y sert de
  // soulignement actif et d'aplat de compteur et d'avatar (texte admin-bar-bg)
  ['admin-bar-text', 'admin-bar-bg', 'text'],
  ['admin-bar-text-muted', 'admin-bar-bg', 'text'],
  ['flag', 'admin-bar-bg', 'icon'],
  ['admin-bar-bg', 'flag', 'text'],

  // Types d'entrées : pastille, icône, bordure 3 px, nœud du graphe (jamais du texte)…
  ['entry-note', 'surface-raised', 'icon'],
  ['entry-event', 'surface-raised', 'icon'],
  ['entry-situation', 'surface-raised', 'icon'],
  ['entry-feeling', 'surface-raised', 'icon'],
  ['entry-session', 'surface-raised', 'icon'],
  ['entry-medication', 'surface-raised', 'icon'],
  // … sauf la situation, couleur « texte » de l'étude §7 (libellé de couloir de la timeline)
  ['entry-situation', 'surface-raised', 'text'],

  // Familles d'émotions : pastilles (timeline, facettes), points de la courbe
  [
    'emotion-joy',
    'surface-raised',
    'icon',
    { waiver: { themes: LIGHT_THEMES, floor: 2.25, reason: STUDY_EMOTIONS } },
  ],
  ['emotion-trust', 'surface-raised', 'icon'],
  ['emotion-fear', 'surface-raised', 'icon'],
  ['emotion-surprise', 'surface-raised', 'icon'],
  ['emotion-sadness', 'surface-raised', 'icon'],
  ['emotion-disgust', 'surface-raised', 'icon'],
  ['emotion-anger', 'surface-raised', 'icon'],
  ['emotion-anticipation', 'surface-raised', 'icon'],

  // Liens du graphe (canevas sur surface-raised)
  ['link', 'surface-raised', 'icon'],
  [
    'link-proposed',
    'surface-raised',
    'icon',
    {
      waiver: {
        themes: LIGHT_THEMES,
        floor: 1.75,
        reason:
          'suggestion IA V2, pointillé #B9C2D1 de l’étude §4 voulu plus pâle que le lien accepté ; ' +
          'l’étiquette « suggéré » en text-secondary porte l’information',
      },
    },
  ],
];

function parseBlocks(source) {
  // Commentaires retirés d'abord : un « } » dans un commentaire ne coupe plus un bloc.
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = {};
  const blockRe = /:root(?:\[data-theme=['"]?(\w+)['"]?\])?\s*\{([^}]*)\}/g;
  let matched = 0;
  for (const [, theme = 'light', body] of css.matchAll(blockRe)) {
    // Un bloc en double (second :root, :root dans un @media…) serait fusionné en silence.
    if (blocks[theme]) throw new Error(`tokens.css : bloc du thème ${theme} déclaré deux fois`);
    const vars = (blocks[theme] = {});
    matched++;
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim();
    }
  }
  // Tout sélecteur de thème doit être lu ici (pas de html[data-theme=…] ignoré en silence).
  const themed = (css.match(/data-theme/g) ?? []).length;
  if (themed !== matched - (blocks.light ? 1 : 0)) {
    throw new Error('tokens.css : sélecteur data-theme hors de la forme :root[data-theme=…] { … }');
  }
  if (!blocks.light) throw new Error('tokens.css : bloc :root introuvable');
  return blocks;
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`couleur non hexadécimale sur 6 chiffres : ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Contrôle de l'outil lui-même : bornes WCAG et deux valeurs publiées dans l'étude §7 (les rapports
// sombres de l'étude §6 sont arrondis par défaut : 12,4 publié pour 12,78 calculé, 5,1 pour 5,64).
for (const [fg, bg, expected] of [
  ['#000000', '#FFFFFF', 21],
  ['#777777', '#777777', 1],
  ['#1E2633', '#FFFFFF', 15.1],
  ['#FFFFFF', '#3A63C2', 5.7],
]) {
  const got = contrast(fg, bg);
  if (Math.abs(got - expected) > 0.2) {
    console.error(
      `Calcul de contraste faux : ${fg} sur ${bg} = ${got.toFixed(2)}, attendu ${expected}`,
    );
    process.exit(2);
  }
}

const blocks = parseBlocks(readFileSync(TOKENS, 'utf8'));
const themes = Object.fromEntries(
  THEMES.map((t) => [t, { ...blocks.light, ...(blocks[t] ?? {}) }]),
);
let failures = 0;
let checked = 0;
let waived = 0;

// 1. Couverture des thèmes
console.log('Couverture des thèmes');
const rootNames = Object.keys(blocks.light);
const darkMissing = rootNames.filter(
  (name) => !(name in (blocks.dark ?? {})) && !SAME_IN_ALL[name],
);
const darkUseless = Object.keys(SAME_IN_ALL).filter((name) => name in (blocks.dark ?? {}));
const unknown = THEMES.flatMap((t) =>
  Object.keys(blocks[t] ?? {})
    .filter((name) => !(name in blocks.light))
    .map((name) => `${t} : --${name}`),
);
const softExtra = Object.keys(blocks.soft ?? {}).filter((name) => !SOFT_ONLY.includes(name));
for (const [problems, message] of [
  [
    darkMissing.map((n) => `--${n}`),
    'non redéfini(s) en sombre (ajouter une valeur sombre, ou une entrée motivée dans SAME_IN_ALL)',
  ],
  [darkUseless.map((n) => `--${n}`), 'dans SAME_IN_ALL mais redéfini(s) en sombre'],
  [unknown, 'absent(s) de :root'],
  [
    softExtra.map((n) => `--${n}`),
    `redéfini(s) en doux hors de ${SOFT_ONLY.join(', ')} (étude §6)`,
  ],
]) {
  if (problems.length) {
    console.error(`  ✗ ${problems.join(', ')} : ${message}`);
    failures++;
  }
}
if (!failures) {
  console.log(
    `  ✓ ${rootNames.length} tokens dans :root ; sombre complet ` +
      `(identiques par choix : ${Object.keys(SAME_IN_ALL).join(', ')}) ; doux limité à ${SOFT_ONLY.join(', ')}`,
  );
}

// 2. Contrastes
for (const theme of THEMES) {
  const vars = themes[theme];
  console.log(`\nThème ${theme}`);
  for (const [fg, bg, kind, options = {}] of PAIRS) {
    if (options.only && !options.only.includes(theme)) continue;
    const missing = [fg, bg].filter((name) => !vars[name]);
    if (missing.length) {
      console.error(`  ✗ token manquant : ${missing.map((n) => `--${n}`).join(', ')}`);
      failures++;
      continue;
    }
    const ratio = contrast(vars[fg], vars[bg]);
    const ok = ratio >= MIN[kind];
    const waiver = options.waiver?.themes.includes(theme) ? options.waiver : null;
    checked++;
    const measure = `${fg} sur ${bg} (${kind}) : ${ratio.toFixed(2)}:1, minimum ${MIN[kind]}:1`;
    if (ok && !waiver) {
      console.log(`  ✓ ${measure}`);
    } else if (!ok && waiver && ratio < waiver.floor) {
      failures++;
      console.error(`  ✗ ${measure} — sous le plancher de l’exception (${waiver.floor}:1)`);
    } else if (!ok && waiver) {
      waived++;
      console.warn(
        `  ⚠ ${measure} — exception documentée (plancher ${waiver.floor}:1) : ${waiver.reason}`,
      );
    } else if (ok && waiver) {
      failures++;
      console.error(`  ✗ ${measure} — exception devenue inutile : la retirer de PAIRS`);
    } else {
      failures++;
      console.error(`  ✗ ${measure}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} échec(s). Voir docs/Etude-couleurs-Nordique.md §6 et §7.`);
  process.exit(1);
}
console.log(
  `\nContrastes : ${checked} couples vérifiés sur ${THEMES.length} thèmes, tous au-dessus du seuil` +
    (waived ? ` hors ${waived} exception(s) documentée(s) (⚠ ci-dessus).` : '.'),
);
