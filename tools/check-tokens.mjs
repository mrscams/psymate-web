#!/usr/bin/env node
// pnpm check:tokens : test de non-régression de la palette (étude couleurs §8).
//
// Lit src/theme/tokens.css, reconstitue chaque thème (clair = :root ; sombre et doux = :root
// surchargé par [data-theme]) et calcule le rapport de contraste WCAG 2.1 de chaque couple déclaré
// ci-dessous. Échoue sous 4,5:1 pour du texte et 3:1 pour une icône ou un élément graphique.
//
// Ajouter un couple ici quand un nouvel usage apparaît ; ne jamais retoucher une couleur de
// tokens.css pour faire passer ce test sans décision écrite (G-decisions ou étude couleurs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/theme/tokens.css', import.meta.url));
const MIN = { text: 4.5, icon: 3 };

/**
 * Couples déclarés : [premier plan, fond, nature, thèmes (tous par défaut)].
 * Sources : étude §7 (contrastes vérifiés, mode clair), §6 (mode sombre), §3 (règles d'emploi).
 */
const PAIRS = [
  // Texte sur les surfaces
  ['text-primary', 'surface-raised', 'text'],
  ['text-primary', 'surface-ground', 'text'],
  ['text-primary', 'surface-sunken', 'text'],
  ['text-secondary', 'surface-raised', 'text'],
  ['text-secondary', 'surface-ground', 'text'],
  ['text-primary', 'search-highlight', 'text', ['light', 'soft']],
  // Primaire : bouton plein, liens, états actifs, bandeau d'information
  ['primary-on', 'primary', 'text'],
  ['primary', 'surface-raised', 'text'],
  ['primary-hover', 'primary-tint', 'text'],
  ['text-primary', 'primary-tint', 'text'],
  // Ressenti
  ['feeling-text', 'feeling-tint', 'text'],
  ['feeling', 'surface-raised', 'icon'],
  // Signalétique système (fond pâle + texte foncé, identiques dans les deux thèmes pour l'instant)
  ['danger', 'danger-bg', 'text'],
  ['warning', 'warning-bg', 'text'],
  ['success', 'success-bg', 'text'],
  ['danger', 'surface-raised', 'text', ['light', 'soft']],
  ['info', 'info-bg', 'text'],
  ['danger-on', 'danger', 'text'],
  // Barre d'administration (fiche 00 §5), mêmes valeurs dans les trois thèmes
  ['admin-bar-text', 'admin-bar-bg', 'text'],
  ['admin-bar-text-muted', 'admin-bar-bg', 'text'],
  ['flag', 'admin-bar-bg', 'icon'],
  // Types d'entrées : pastille, icône, bordure 3 px (jamais du texte)
  ['entry-note', 'surface-raised', 'icon'],
  ['entry-event', 'surface-raised', 'icon'],
  ['entry-situation', 'surface-raised', 'icon'],
  ['entry-feeling', 'surface-raised', 'icon'],
  ['entry-session', 'surface-raised', 'icon'],
  ['entry-medication', 'surface-raised', 'icon'],
  // Flag praticien (icône sur fond blanc)
  ['flag', 'surface-raised', 'icon', ['light', 'soft']],
];

const THEMES = ['light', 'dark', 'soft'];

function parseThemes(css) {
  const blocks = {};
  const blockRe = /:root(?:\[data-theme=['"]?(\w+)['"]?\])?\s*\{([^}]*)\}/g;
  for (const [, theme = 'light', body] of css.matchAll(blockRe)) {
    const vars = (blocks[theme] ??= {});
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name, value] of clean.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim();
    }
  }
  if (!blocks.light) throw new Error('tokens.css : bloc :root introuvable');
  return Object.fromEntries(THEMES.map((t) => [t, { ...blocks.light, ...(blocks[t] ?? {}) }]));
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

// Contrôle de l'outil lui-même : bornes WCAG et deux valeurs publiées dans l'étude §7.
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

const themes = parseThemes(readFileSync(TOKENS, 'utf8'));
let failures = 0;
let checked = 0;

for (const theme of THEMES) {
  const vars = themes[theme];
  console.log(`\nThème ${theme}`);
  for (const [fg, bg, kind, only] of PAIRS) {
    if (only && !only.includes(theme)) continue;
    const missing = [fg, bg].filter((name) => !vars[name]);
    if (missing.length) {
      console.error(`  ✗ token manquant : ${missing.map((n) => `--${n}`).join(', ')}`);
      failures++;
      continue;
    }
    const ratio = contrast(vars[fg], vars[bg]);
    const ok = ratio >= MIN[kind];
    checked++;
    if (!ok) failures++;
    const line = `  ${ok ? '✓' : '✗'} ${fg} sur ${bg} (${kind}) : ${ratio.toFixed(2)}:1, minimum ${MIN[kind]}:1`;
    (ok ? console.log : console.error)(line);
  }
}

if (failures > 0) {
  console.error(`\n${failures} couple(s) sous le seuil. Voir docs/Etude-couleurs-Nordique.md §7.`);
  process.exit(1);
}
console.log(
  `\nContrastes : ${checked} couples vérifiés sur ${THEMES.length} thèmes, tous au-dessus du seuil.`,
);
