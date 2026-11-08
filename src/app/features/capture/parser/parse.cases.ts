// Table de phrases de la grammaire (critère C2 M6-01 : 40 phrases au moins, chaque règle couverte).
// Rejouée par parse.spec.ts ; la barre de commande (M6-02) la réutilise pour son test d'aperçu.
//
// Horloge fixe : mercredi 11 novembre 2026, 09:30 UTC, soit 10:30 à Paris (fuseau injecté). Aucun cas
// ne dépend de l'heure ni du fuseau de la machine.

import { PARSE_HINTS } from './parse.types';
import type {
  EmotionOption,
  ParsedOccurred,
  ParseOptions,
  ParseResult,
  ParseWarning,
  ParseWarningCode,
  ParseWarningParams,
} from './parse.types';

/** Les 29 émotions globales (E5.2) et trois émotions personnalisées, dans l'ordre de l'API. */
export const CASE_EMOTIONS: readonly EmotionOption[] = [
  { code: 'serenity', labelFr: 'Sérénité', labelEn: 'Serenity' },
  { code: 'joy', labelFr: 'Joie', labelEn: 'Joy' },
  { code: 'ecstasy', labelFr: 'Extase', labelEn: 'Ecstasy' },
  { code: 'acceptance', labelFr: 'Acceptation', labelEn: 'Acceptance' },
  { code: 'trust', labelFr: 'Confiance', labelEn: 'Trust' },
  { code: 'admiration', labelFr: 'Admiration', labelEn: 'Admiration' },
  { code: 'apprehension', labelFr: 'Appréhension', labelEn: 'Apprehension' },
  { code: 'fear', labelFr: 'Peur', labelEn: 'Fear' },
  { code: 'terror', labelFr: 'Terreur', labelEn: 'Terror' },
  { code: 'distraction', labelFr: 'Distraction', labelEn: 'Distraction' },
  { code: 'surprise', labelFr: 'Surprise', labelEn: 'Surprise' },
  { code: 'amazement', labelFr: 'Stupéfaction', labelEn: 'Amazement' },
  { code: 'pensiveness', labelFr: 'Mélancolie', labelEn: 'Pensiveness' },
  { code: 'sadness', labelFr: 'Tristesse', labelEn: 'Sadness' },
  { code: 'grief', labelFr: 'Chagrin', labelEn: 'Grief' },
  { code: 'boredom', labelFr: 'Ennui', labelEn: 'Boredom' },
  { code: 'disgust', labelFr: 'Dégoût', labelEn: 'Disgust' },
  { code: 'loathing', labelFr: 'Répulsion', labelEn: 'Loathing' },
  { code: 'annoyance', labelFr: 'Agacement', labelEn: 'Annoyance' },
  { code: 'anger', labelFr: 'Colère', labelEn: 'Anger' },
  { code: 'rage', labelFr: 'Rage', labelEn: 'Rage' },
  { code: 'interest', labelFr: 'Intérêt', labelEn: 'Interest' },
  { code: 'anticipation', labelFr: 'Anticipation', labelEn: 'Anticipation' },
  { code: 'vigilance', labelFr: 'Vigilance', labelEn: 'Vigilance' },
  { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
  { code: 'guilt', labelFr: 'Culpabilité', labelEn: 'Guilt' },
  { code: 'shame', labelFr: 'Honte', labelEn: 'Shame' },
  { code: 'emptiness', labelFr: 'Vide', labelEn: 'Emptiness' },
  { code: 'calm', labelFr: 'Calme', labelEn: 'Calm' },
  { code: 'c_1a2b3c4d', labelFr: 'Tristesse profonde', labelEn: null },
  { code: 'c_5e6f7a8b', labelFr: 'Épuisement', labelEn: null },
  { code: 'c_9c0d1e2f', labelFr: 'Rage froide' },
];

/** Mercredi 11 novembre 2026, 10:30 à Paris. */
export const CASE_NOW = new Date('2026-11-11T09:30:00Z');

export const CASE_OPTIONS: ParseOptions = {
  emotions: CASE_EMOTIONS,
  now: CASE_NOW,
  locale: 'fr',
  timeZone: 'Europe/Paris',
};

/** 10 novembre 2026, 23:30 UTC : déjà le 11 à Paris, encore le 10 en UTC. */
const NEAR_MIDNIGHT = new Date('2026-11-10T23:30:00Z');

export interface ParseCase {
  /** Règle couverte, en clair (sert de nom au test). */
  readonly rule: string;
  readonly input: string;
  /** Options qui remplacent CASE_OPTIONS pour ce cas. */
  readonly options?: Partial<ParseOptions>;
  readonly expected: ParseResult;
}

export function caseOptions(parseCase: ParseCase): ParseOptions {
  return { ...CASE_OPTIONS, ...parseCase.options };
}

function warn<C extends ParseWarningCode>(code: C, params: ParseWarningParams[C]): ParseWarning {
  return { code, hint: PARSE_HINTS[code], params } as ParseWarning;
}

const NOW: ParsedOccurred = { from: '2026-11-11T09:30:00.000Z', precision: 'exact' };
const KNOWN_PREFIXES = ['/evt', '/sit', '/med', '/note'];
const MISSING_INTENSITY = warn('MISSING_INTENSITY', { min: 0, max: 10 });
const EMPTY_TEXT = warn('EMPTY_TEXT', {});

function day(date: string, expression: string): ParsedOccurred {
  return { from: `${date}T00:00:00Z`, precision: 'day', expression };
}

function month(date: string, expression: string): ParsedOccurred {
  return { from: `${date}-01T00:00:00Z`, precision: 'month', expression };
}

function year(value: number, expression: string): ParsedOccurred {
  return { from: `${value}-01-01T00:00:00Z`, precision: 'year', expression };
}

function exact(from: string, expression: string): ParsedOccurred {
  return { from, precision: 'exact', expression };
}

function period(from: string, to: string, label: string, expression: string): ParsedOccurred {
  return {
    from: `${from}T00:00:00Z`,
    precision: 'period',
    to: `${to}T00:00:00Z`,
    label,
    expression,
  };
}

function result(partial: Partial<ParseResult> & Pick<ParseResult, 'type'>): ParseResult {
  return { text: '', occurred: NOW, warnings: [], ...partial };
}

export const PARSE_CASES: readonly ParseCase[] = [
  // B5, tableau de l'alternative A.
  {
    rule: 'B5 : préfixe d’émotion suffisant, intensité, texte',
    input: "anx 8 n'a pas dormi",
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      text: "n'a pas dormi",
    }),
  },
  {
    rule: 'B5 : ressenti et cible du lien (e2e M6-02)',
    input: "anx 8 n'a pas dormi > entretien",
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      text: "n'a pas dormi",
      target: { query: 'entretien' },
    }),
  },
  {
    rule: 'B5 : /evt et jour de semaine (mardi dernier)',
    input: '/evt entretien avec le manager mardi',
    expected: result({
      type: 'event',
      text: 'entretien avec le manager',
      occurred: day('2026-11-10', 'mardi'),
    }),
  },
  {
    rule: 'B5 : /sit et « depuis mars » (précision mois)',
    input: '/sit surcharge au travail depuis mars',
    expected: result({
      type: 'situation',
      text: 'surcharge au travail',
      occurred: month('2026-03', 'depuis mars'),
    }),
  },
  {
    rule: 'B5 : /med, texte intact (50 mg n’est ni une intensité ni une date)',
    input: '/med sertraline 50 mg matin',
    expected: result({ type: 'medication', text: 'sertraline 50 mg matin' }),
  },
  {
    rule: 'B5 : sans préfixe ni émotion → note',
    input: 'semble plus détendu',
    expected: result({ type: 'note', text: 'semble plus détendu' }),
  },

  // Émotions.
  {
    rule: 'émotion : libellé exact, casse et accents',
    input: 'Anxiété 6 au réveil',
    expected: result({ type: 'feeling', emotionCode: 'anxiety', intensity: 6, text: 'au réveil' }),
  },
  {
    rule: 'émotion : préfixe en majuscules',
    input: 'ANX 7',
    expected: result({ type: 'feeling', emotionCode: 'anxiety', intensity: 7 }),
  },
  {
    rule: 'émotion : code exact',
    input: 'anxiety 5',
    expected: result({ type: 'feeling', emotionCode: 'anxiety', intensity: 5 }),
  },
  {
    rule: 'émotion : préfixe ambigu (globale et personnalisée)',
    input: 'tri 5 pleure souvent',
    expected: result({
      type: 'feeling',
      intensity: 5,
      text: 'pleure souvent',
      warnings: [warn('AMBIGUOUS_EMOTION', { word: 'tri', candidates: ['sadness', 'c_1a2b3c4d'] })],
    }),
  },
  {
    rule: 'émotion : préfixe ambigu (deux globales, code et libellé)',
    input: 'dis 4 au travail',
    expected: result({
      type: 'feeling',
      intensity: 4,
      text: 'au travail',
      warnings: [
        warn('AMBIGUOUS_EMOTION', { word: 'dis', candidates: ['distraction', 'disgust'] }),
      ],
    }),
  },
  {
    rule: 'émotion : l’exact gagne sur le préfixe (tristesse / tristesse profonde)',
    input: 'tristesse 6',
    expected: result({ type: 'feeling', emotionCode: 'sadness', intensity: 6 }),
  },
  {
    rule: 'émotion : libellé personnalisé en deux mots, « depuis hier »',
    input: 'tristesse profonde 7 depuis hier',
    expected: result({
      type: 'feeling',
      emotionCode: 'c_1a2b3c4d',
      intensity: 7,
      occurred: day('2026-11-10', 'depuis hier'),
    }),
  },
  {
    rule: 'émotion : préfixe d’une personnalisée, sans accent',
    input: 'epui 8 fin de semaine',
    expected: result({
      type: 'feeling',
      emotionCode: 'c_5e6f7a8b',
      intensity: 8,
      text: 'fin de semaine',
    }),
  },
  {
    rule: 'émotion : « rage » exact plutôt que « Rage froide »',
    input: 'rage 9',
    expected: result({ type: 'feeling', emotionCode: 'rage', intensity: 9 }),
  },
  {
    rule: 'émotion inconnue suivie d’une intensité → création proposée',
    input: "stress 7 avant l'examen",
    expected: result({
      type: 'feeling',
      intensity: 7,
      text: "avant l'examen",
      warnings: [warn('UNKNOWN_EMOTION', { word: 'stress' })],
    }),
  },
  {
    rule: 'ressenti sans intensité',
    input: "anx n'a pas dormi",
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      text: "n'a pas dormi",
      warnings: [MISSING_INTENSITY],
    }),
  },

  // Intensité.
  {
    rule: 'intensité hors bornes (0 à 10)',
    input: 'anx 12 crise',
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      text: 'crise',
      warnings: [warn('INTENSITY_OUT_OF_RANGE', { value: 12, min: 0, max: 10 })],
    }),
  },
  {
    rule: 'intensité 0 acceptée (borne du contrat)',
    input: 'anx 0 calme plat',
    expected: result({ type: 'feeling', emotionCode: 'anxiety', intensity: 0, text: 'calme plat' }),
  },
  {
    rule: 'intensité « 10/10 »',
    input: 'anx 10/10',
    expected: result({ type: 'feeling', emotionCode: 'anxiety', intensity: 10 }),
  },
  {
    rule: 'ponctuation collée et date au milieu',
    input: 'peur 3, hier soir',
    expected: result({
      type: 'feeling',
      emotionCode: 'fear',
      intensity: 3,
      text: 'soir',
      occurred: day('2026-11-10', 'hier'),
    }),
  },

  // Préfixes.
  {
    rule: '/note : aucune émotion détectée',
    input: '/note anx 8 à revoir',
    expected: result({ type: 'note', text: 'anx 8 à revoir' }),
  },
  {
    rule: 'préfixe sans casse',
    input: '/EVT Dispute au téléphone',
    expected: result({ type: 'event', text: 'Dispute au téléphone' }),
  },
  {
    rule: 'préfixe long accentué, lundi dernier',
    input: '/événement promotion annoncée lundi',
    expected: result({
      type: 'event',
      text: 'promotion annoncée',
      occurred: day('2026-11-09', 'lundi'),
    }),
  },
  {
    rule: 'préfixe inconnu → note',
    input: '/xyz test',
    expected: result({
      type: 'note',
      text: 'test',
      warnings: [warn('UNKNOWN_PREFIX', { prefix: '/xyz', known: KNOWN_PREFIXES })],
    }),
  },
  {
    rule: 'préfixe inconnu, puis émotion reconnue',
    input: '/xyz anx 5',
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 5,
      warnings: [warn('UNKNOWN_PREFIX', { prefix: '/xyz', known: KNOWN_PREFIXES })],
    }),
  },
  {
    rule: 'préfixe seul : titre manquant',
    input: '/evt',
    expected: result({ type: 'event', warnings: [EMPTY_TEXT] }),
  },
  {
    rule: 'saisie vide',
    input: '',
    expected: result({ type: 'note', warnings: [EMPTY_TEXT] }),
  },

  // Jours relatifs.
  {
    rule: 'jour de semaine du jour même → il y a 7 jours',
    input: '/evt réunion mercredi',
    expected: result({ type: 'event', text: 'réunion', occurred: day('2026-11-04', 'mercredi') }),
  },
  {
    rule: '« jeudi dernier »',
    input: '/evt appel jeudi dernier',
    expected: result({
      type: 'event',
      text: 'appel',
      occurred: day('2026-11-05', 'jeudi dernier'),
    }),
  },
  {
    rule: '« aujourd’hui » (apostrophe typographique)',
    input: '/note a pleuré aujourd’hui',
    expected: result({
      type: 'note',
      text: 'a pleuré',
      occurred: day('2026-11-11', 'aujourd’hui'),
    }),
  },
  {
    rule: '« avant-hier »',
    input: '/note dispute avant-hier',
    expected: result({ type: 'note', text: 'dispute', occurred: day('2026-11-09', 'avant-hier') }),
  },
  {
    rule: '« avant hier » en deux mots',
    input: '/note dispute avant hier soir',
    expected: result({
      type: 'note',
      text: 'dispute soir',
      occurred: day('2026-11-09', 'avant hier'),
    }),
  },

  // Durées écoulées.
  {
    rule: '« il y a 3 j »',
    input: '/note il y a 3 j malaise',
    expected: result({ type: 'note', text: 'malaise', occurred: day('2026-11-08', 'il y a 3 j') }),
  },
  {
    rule: '« il y a 3j » collé',
    input: '/note malaise il y a 3j',
    expected: result({ type: 'note', text: 'malaise', occurred: day('2026-11-08', 'il y a 3j') }),
  },
  {
    rule: '« depuis 2 semaines »',
    input: '/sit isolement depuis 2 semaines',
    expected: result({
      type: 'situation',
      text: 'isolement',
      occurred: day('2026-10-28', 'depuis 2 semaines'),
    }),
  },
  {
    rule: 'nombre en lettres : « il y a une semaine »',
    input: '/note rechute il y a une semaine',
    expected: result({
      type: 'note',
      text: 'rechute',
      occurred: day('2026-11-04', 'il y a une semaine'),
    }),
  },
  {
    rule: '« ça fait 2 jours »',
    input: '/sit insomnie ça fait 2 jours',
    expected: result({
      type: 'situation',
      text: 'insomnie',
      occurred: day('2026-11-09', 'ça fait 2 jours'),
    }),
  },
  {
    rule: '« il y a 2 h » (précision exact)',
    input: "/note crise d'angoisse il y a 2 h",
    expected: result({
      type: 'note',
      text: "crise d'angoisse",
      occurred: exact('2026-11-11T07:30:00.000Z', 'il y a 2 h'),
    }),
  },
  {
    rule: '« il y a 10 min »',
    input: '/note appel il y a 10 min',
    expected: result({
      type: 'note',
      text: 'appel',
      occurred: exact('2026-11-11T09:20:00.000Z', 'il y a 10 min'),
    }),
  },
  {
    rule: '« il y a 1 mois » (précision mois)',
    input: '/sit chômage il y a 1 mois',
    expected: result({
      type: 'situation',
      text: 'chômage',
      occurred: month('2026-10', 'il y a 1 mois'),
    }),
  },
  {
    rule: '« il y a 2 ans » (précision année)',
    input: '/sit divorce il y a 2 ans',
    expected: result({ type: 'situation', text: 'divorce', occurred: year(2024, 'il y a 2 ans') }),
  },

  // Mois, saisons, années.
  {
    rule: '« en mars » : mois le plus récent non futur',
    input: '/sit déménagement en mars',
    expected: result({
      type: 'situation',
      text: 'déménagement',
      occurred: month('2026-03', 'en mars'),
    }),
  },
  {
    rule: '« en décembre » en novembre → l’an dernier',
    input: '/sit tensions en décembre',
    expected: result({
      type: 'situation',
      text: 'tensions',
      occurred: month('2025-12', 'en décembre'),
    }),
  },
  {
    rule: '« en novembre » : le mois courant compte',
    input: '/sit fatigue en novembre',
    expected: result({
      type: 'situation',
      text: 'fatigue',
      occurred: month('2026-11', 'en novembre'),
    }),
  },
  {
    rule: '« mars 2024 » sans amorce',
    input: '/sit arrêt maladie mars 2024',
    expected: result({
      type: 'situation',
      text: 'arrêt maladie',
      occurred: month('2024-03', 'mars 2024'),
    }),
  },
  {
    rule: '« l’été 2024 » → période avec libellé',
    input: "/sit burn-out l'été 2024",
    expected: result({
      type: 'situation',
      text: 'burn-out',
      occurred: period('2024-06-01', '2024-09-01', 'été 2024', "l'été 2024"),
    }),
  },
  {
    rule: '« hiver 2024 » → décembre 2024 à février 2025',
    input: '/sit deuil hiver 2024',
    expected: result({
      type: 'situation',
      text: 'deuil',
      occurred: period('2024-12-01', '2025-03-01', 'hiver 2024', 'hiver 2024'),
    }),
  },
  {
    rule: '« au printemps 2025 »',
    input: '/sit reprise au printemps 2025',
    expected: result({
      type: 'situation',
      text: 'reprise',
      occurred: period('2025-03-01', '2025-06-01', 'printemps 2025', 'au printemps 2025'),
    }),
  },
  {
    rule: '« en 2019 » (précision année)',
    input: '/sit licenciement en 2019',
    expected: result({ type: 'situation', text: 'licenciement', occurred: year(2019, 'en 2019') }),
  },

  // Dates explicites.
  {
    rule: '« le 12 mars » : le plus récent non futur',
    input: '/evt mariage le 12 mars',
    expected: result({ type: 'event', text: 'mariage', occurred: day('2026-03-12', 'le 12 mars') }),
  },
  {
    rule: '« 12 décembre » en novembre → l’an dernier',
    input: '/note crise 12 décembre',
    expected: result({ type: 'note', text: 'crise', occurred: day('2025-12-12', '12 décembre') }),
  },
  {
    rule: '« 1er avril 2024 »',
    input: '/evt accident 1er avril 2024',
    expected: result({
      type: 'event',
      text: 'accident',
      occurred: day('2024-04-01', '1er avril 2024'),
    }),
  },
  {
    rule: '« le 20/12 » (JJ/MM avec amorce)',
    input: '/evt opération le 20/12',
    expected: result({ type: 'event', text: 'opération', occurred: day('2025-12-20', 'le 20/12') }),
  },
  {
    rule: '« 03/02/2024 »',
    input: '/evt opération 03/02/2024',
    expected: result({
      type: 'event',
      text: 'opération',
      occurred: day('2024-02-03', '03/02/2024'),
    }),
  },
  {
    rule: 'date ISO',
    input: '/evt naissance 2025-07-14',
    expected: result({
      type: 'event',
      text: 'naissance',
      occurred: day('2025-07-14', '2025-07-14'),
    }),
  },
  {
    rule: 'date impossible : signalée, laissée dans le texte',
    input: '/evt rendez-vous 31 février',
    expected: result({
      type: 'event',
      text: 'rendez-vous 31 février',
      warnings: [warn('INVALID_DATE', { expression: '31 février' })],
    }),
  },
  {
    rule: 'date future signalée',
    input: '/evt départ prévu en 2027',
    expected: result({
      type: 'event',
      text: 'départ prévu',
      occurred: year(2027, 'en 2027'),
      warnings: [warn('FUTURE_DATE', { expression: 'en 2027' })],
    }),
  },
  {
    rule: 'deux dates : la première retenue, l’autre reste dans le texte',
    input: '/note hier puis lundi',
    expected: result({
      type: 'note',
      text: 'puis lundi',
      occurred: day('2026-11-10', 'hier'),
      warnings: [warn('AMBIGUOUS_DATE', { used: 'hier', ignored: ['lundi'] })],
    }),
  },

  // Faux amis de date.
  {
    rule: 'mois seul sans amorce : pas une date',
    input: '/note mars seul',
    expected: result({ type: 'note', text: 'mars seul' }),
  },
  {
    rule: '« a été » : pas une saison',
    input: '/note a été difficile',
    expected: result({ type: 'note', text: 'a été difficile' }),
  },
  {
    rule: '« 1/2 comprimé » : pas une date',
    input: '/med lorazépam 1/2 comprimé',
    expected: result({ type: 'medication', text: 'lorazépam 1/2 comprimé' }),
  },

  // Guillemets et cible.
  {
    rule: 'guillemets : contenu littéral (ni émotion, ni date)',
    input: '/note il a dit « je suis anx 8 hier »',
    expected: result({ type: 'note', text: 'il a dit « je suis anx 8 hier »' }),
  },
  {
    rule: 'guillemets droits en tête : pas d’émotion',
    input: '"anx" 8 hier',
    expected: result({ type: 'note', text: '"anx" 8', occurred: day('2026-11-10', 'hier') }),
  },
  {
    rule: 'cible entre guillemets',
    input: 'anx 8 > « entretien annuel »',
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      target: { query: 'entretien annuel' },
    }),
  },
  {
    rule: '`>` vide',
    input: 'anx 8 dormi > ',
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      text: 'dormi',
      warnings: [warn('EMPTY_TARGET', {})],
    }),
  },
  {
    rule: 'seul le dernier `>` compte',
    input: '/note avant > après > entretien',
    expected: result({ type: 'note', text: 'avant > après', target: { query: 'entretien' } }),
  },
  {
    rule: '`>` entre guillemets non fermés : littéral',
    input: '/note « pas fermé > entretien',
    expected: result({
      type: 'note',
      text: '« pas fermé > entretien',
      warnings: [warn('UNCLOSED_QUOTE', { quote: '«', index: 6 })],
    }),
  },
  {
    rule: 'espaces normalisés',
    input: "  anx   8    n'a   pas   dormi  ",
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      text: "n'a pas dormi",
    }),
  },

  // Fuseau injecté, jamais celui de la machine.
  {
    rule: 'près de minuit : jour civil de Paris',
    input: '/note crise hier',
    options: { now: NEAR_MIDNIGHT, timeZone: 'Europe/Paris' },
    expected: result({
      type: 'note',
      text: 'crise',
      occurred: day('2026-11-10', 'hier'),
    }),
  },
  {
    rule: 'près de minuit : jour civil UTC',
    input: '/note crise hier',
    options: { now: NEAR_MIDNIGHT, timeZone: 'UTC' },
    expected: result({ type: 'note', text: 'crise', occurred: day('2026-11-09', 'hier') }),
  },
  {
    rule: 'près de minuit : sans fuseau, UTC',
    input: '/note crise hier',
    options: { now: NEAR_MIDNIGHT, timeZone: undefined },
    expected: result({ type: 'note', text: 'crise', occurred: day('2026-11-09', 'hier') }),
  },
  {
    rule: 'près de minuit : Kiritimati (UTC+14)',
    input: '/note crise hier',
    options: { now: NEAR_MIDNIGHT, timeZone: 'Pacific/Kiritimati' },
    expected: result({ type: 'note', text: 'crise', occurred: day('2026-11-10', 'hier') }),
  },
  {
    rule: 'fuseau inconnu → UTC, signalé',
    input: '/note crise hier',
    options: { timeZone: 'Mars/Olympus' },
    expected: result({
      type: 'note',
      text: 'crise',
      occurred: day('2026-11-10', 'hier'),
      warnings: [warn('INVALID_TIME_ZONE', { timeZone: 'Mars/Olympus' })],
    }),
  },

  // Locale.
  {
    rule: 'locale fr-FR : grammaire française',
    input: '/evt dispute samedi',
    options: { locale: 'fr-FR' },
    expected: result({ type: 'event', text: 'dispute', occurred: day('2026-11-07', 'samedi') }),
  },
  {
    rule: 'en : « yesterday »',
    input: "anx 8 couldn't sleep yesterday",
    options: { locale: 'en' },
    expected: result({
      type: 'feeling',
      emotionCode: 'anxiety',
      intensity: 8,
      text: "couldn't sleep",
      occurred: day('2026-11-10', 'yesterday'),
    }),
  },
  {
    rule: 'en : « last monday »',
    input: '/evt meeting last monday',
    options: { locale: 'en-GB' },
    expected: result({
      type: 'event',
      text: 'meeting',
      occurred: day('2026-11-09', 'last monday'),
    }),
  },
  {
    rule: 'en : « since march »',
    input: '/sit overload since march',
    options: { locale: 'en' },
    expected: result({
      type: 'situation',
      text: 'overload',
      occurred: month('2026-03', 'since march'),
    }),
  },
  {
    rule: 'en : « 3 days ago »',
    input: '/note panic attack 3 days ago',
    options: { locale: 'en' },
    expected: result({
      type: 'note',
      text: 'panic attack',
      occurred: day('2026-11-08', '3 days ago'),
    }),
  },
  {
    rule: 'en : « a week ago »',
    input: '/note dispute a week ago',
    options: { locale: 'en' },
    expected: result({
      type: 'note',
      text: 'dispute',
      occurred: day('2026-11-04', 'a week ago'),
    }),
  },
  {
    rule: 'en : « the day before yesterday »',
    input: '/note relapse the day before yesterday',
    options: { locale: 'en' },
    expected: result({
      type: 'note',
      text: 'relapse',
      occurred: day('2026-11-09', 'the day before yesterday'),
    }),
  },
  {
    rule: 'en : « summer 2024 »',
    input: '/sit burnout summer 2024',
    options: { locale: 'en' },
    expected: result({
      type: 'situation',
      text: 'burnout',
      occurred: period('2024-06-01', '2024-09-01', 'summer 2024', 'summer 2024'),
    }),
  },
  {
    rule: 'en : pas de JJ/MM (ordre ambigu)',
    input: '/evt surgery on 20/12',
    options: { locale: 'en' },
    expected: result({ type: 'event', text: 'surgery on 20/12' }),
  },
];
