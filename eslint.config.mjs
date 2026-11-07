// ESLint (flat config) de psymate-web.
// Règles d'architecture : handbook §5 (frontières) et §11 (règles 1, 2, 9) ; vérifiées en CI.
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

import psymate, { scssTextParser } from './tools/eslint/psymate-plugin.mjs';

/** Features du dossier patient : features/admin n'en importe jamais rien (handbook §5, C6). */
const PATIENT_FEATURES = [
  'patients',
  'patient-shell',
  'overview',
  'timeline',
  'graph',
  'entries',
  'search',
  'capture',
];

/** Seul fichier autorisé à importer le client généré : data/<x>.api.ts (une couche « service de données »). */
const API_CLIENT_FILE = '**/data/*.api.ts';

/**
 * Éléments d'architecture. Les motifs se lisent depuis la fin du chemin, ce qui permet aux fixtures
 * (tools/eslint/fixtures/src/app/…) d'être classées comme le vrai code.
 */
const elements = [
  { type: 'api', pattern: 'src/app/api' },
  { type: 'core', pattern: 'src/app/core/*', capture: ['module'] },
  { type: 'shared', pattern: 'src/app/shared/*', capture: ['module'] },
  { type: 'feature', pattern: 'src/app/features/*', capture: ['feature'] },
  // Fichiers racine de src/app (app.config.ts, app.routes.ts, app.component.ts) ; en dernier : un fichier
  // déjà classé plus haut garde son premier type.
  { type: 'app', pattern: 'src/app' },
];

const featureIndex = { type: 'feature', fileInternalPath: 'index.ts' };

const boundaryPolicies = [
  // Racine (app.config.ts, app.routes.ts, app.component.ts) : core, shared, l'index public des features.
  {
    from: { element: { type: 'app' } },
    allow: { to: { element: [{ type: ['core', 'shared'] }, featureIndex] } },
  },
  // core : transverse, ne dépend que de lui-même.
  { from: { element: { type: 'core' } }, allow: { to: { element: { type: 'core' } } } },
  // shared : peut lire core (i18n, thème) et shared.
  {
    from: { element: { type: 'shared' } },
    allow: { to: { element: { type: ['core', 'shared'] } } },
  },
  // feature : core, shared, son propre contenu, et seulement l'index.ts public des autres features.
  {
    from: { element: { type: 'feature' } },
    allow: {
      to: {
        element: [
          { type: ['core', 'shared'] },
          { type: 'feature', captured: { feature: '{{ from.element.captured.feature }}' } },
          featureIndex,
        ],
      },
    },
  },
  // Client généré : uniquement depuis un data/<x>.api.ts (feature ou core/auth, core/preferences).
  {
    from: { element: { type: ['feature', 'core'], fileInternalPath: API_CLIENT_FILE } },
    allow: { to: { element: { type: 'api' } } },
  },
  { from: { element: { type: 'api' } }, allow: { to: { element: { type: 'api' } } } },
  // admin n'importe jamais une feature patient, même son index (règle testée, C6).
  {
    from: { element: { type: 'feature', captured: { feature: 'admin' } } },
    disallow: { to: { element: { type: 'feature', captured: { feature: PATIENT_FEATURES } } } },
    message:
      "features/admin n'importe jamais une feature patient (features/{{ to.element.captured.feature }}).",
  },
  // public : seulement core/http et core/i18n (pas de SessionStore obligatoire, handbook §5).
  {
    from: { element: { type: 'feature', captured: { feature: 'public' } } },
    disallow: { to: { element: { type: 'core', captured: { module: '!(http|i18n)' } } } },
    message: 'features/public ne lit que core/http et core/i18n.',
  },
];

export default defineConfig([
  globalIgnores([
    '.angular/',
    '.claude/',
    'coverage/',
    'dist/',
    'docs/',
    'node_modules/',
    'out-tsc/',
    'playwright-report/',
    'test-results/',
    // Généré par pnpm contract:pull (M0-07), jamais édité.
    'src/app/api/',
    // Contrôlées par tools/eslint/check-fixtures.mjs (violations voulues).
    'tools/eslint/fixtures/',
  ]),

  {
    files: ['**/*.ts'],
    extends: [
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'pm', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'pm', style: 'camelCase' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },

  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },

  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.recommended],
  },

  // Frontières entre couches et features (handbook §5).
  {
    files: ['src/app/**/*.ts', 'tools/eslint/fixtures/src/app/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,
      'import/resolver': { node: { extensions: ['.ts', '.js', '.mjs'] } },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: boundaryPolicies }],
    },
  },

  // Aucune couleur en dur dans src/app (src/theme/ en est la seule source).
  {
    files: ['src/app/**/*.scss', 'tools/eslint/fixtures/src/app/**/*.scss'],
    languageOptions: { parser: scssTextParser },
  },
  {
    files: ['src/app/**/*.{ts,html,scss}', 'tools/eslint/fixtures/src/app/**/*.{ts,html,scss}'],
    plugins: { psymate },
    rules: { 'psymate/no-hardcoded-color': 'error' },
  },
]);
