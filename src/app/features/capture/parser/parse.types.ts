// Types publics de la grammaire de la barre de commande (B5, alternative A ; tâche M6-01).
//
// Le parseur est pur : aucun DOM, aucun Angular, aucun HTTP, aucune horloge ni fuseau lus dans
// l'environnement. Les types ci-dessous ne référencent pas le client généré (src/app/api) : seuls les
// fichiers data/*.api.ts l'importent. Les unions de chaînes reprennent donc à l'identique les valeurs
// du contrat (docs/contract/openapi.yaml), schémas cités en commentaire.

/**
 * Type d'entrée que la barre sait créer : CreateEntryRequest.type du contrat, sans `session` (une
 * séance se démarre par le bouton de l'en-tête, jamais par la barre). Même chaînes que EntryType
 * de shared/ui.
 */
export type CaptureEntryType = 'note' | 'event' | 'situation' | 'feeling' | 'medication';

/**
 * Précision produite par la barre : EntryOccurredRequest.precision du contrat, sans `life_phase`
 * (bornes déduites de la date de naissance par le serveur). Mêmes chaînes que OccurredPrecision
 * de shared/util. Les saisons n'existent pas dans le contrat : elles deviennent une `period` avec
 * un libellé (« été 2024 ») et une fin, comme l'exige le contrat pour cette précision.
 */
export type CapturePrecision = 'exact' | 'day' | 'month' | 'year' | 'period';

/**
 * Une émotion du vocabulaire du praticien (GET /api/vocabulary/emotions, schéma EmotionView) :
 * les 29 globales et les personnalisées actives. Le parseur compare le code et les deux libellés.
 */
export interface EmotionOption {
  readonly code: string;
  readonly labelFr: string;
  /** Null ou absent pour une émotion personnalisée (saisie en français seulement). */
  readonly labelEn?: string | null;
}

export interface ParseOptions {
  /** Vocabulaire du praticien : globales et personnalisées. */
  readonly emotions: readonly EmotionOption[];
  /** Horloge injectée : le parseur ne lit jamais l'heure de la machine. */
  readonly now: Date;
  /** Locale de l'interface (« fr », « fr-FR », « en »…) : choisit la grammaire des dates. */
  readonly locale: string;
  /**
   * Fuseau IANA du praticien (« Europe/Paris ») : sert seulement à savoir quel jour civil est
   * « aujourd'hui ». Absent : UTC (jamais le fuseau de la machine).
   */
  readonly timeZone?: string;
}

/**
 * Le moment interprété, au format de EntryOccurredRequest : bornes UTC ISO 8601. Les précisions
 * jour, mois, année et période ont des bornes en jours entiers UTC (« 2026-11-10T00:00:00Z »),
 * comme l'éditeur d'entrée ; `to` est exclusive (le jour qui suit la fin).
 */
export interface ParsedOccurred {
  readonly from: string;
  readonly precision: CapturePrecision;
  /** Fin exclusive, seulement pour une période (saison). */
  readonly to?: string;
  /** Libellé de la période (« été 2024 »), obligatoire pour la précision period. */
  readonly label?: string;
  /**
   * Texte de la saisie qui a donné la date (« il y a 3 jours »). Absent : aucune date saisie,
   * `from` vaut `now` en précision exact (le serveur prendrait de même l'instant de saisie).
   */
  readonly expression?: string;
}

export interface ParseTarget {
  /** Début du titre de l'entrée à lier, tel que saisi après le dernier `>` (sans guillemets). */
  readonly query: string;
}

/** Bornes d'intensité d'un ressenti : celles du contrat (EntryFeelingRequest.intensity, 0 à 10). */
export const INTENSITY_MIN = 0;
export const INTENSITY_MAX = 10;

/** Paramètres de chaque avertissement : des données, jamais un texte affiché (M6-02 les traduit). */
export interface ParseWarningParams {
  /** Préfixe `/xxx` inconnu ; `known` liste les préfixes reconnus. */
  UNKNOWN_PREFIX: { readonly prefix: string; readonly known: readonly string[] };
  /** Le premier mot désigne plusieurs émotions ; `candidates` = leurs codes, dans l'ordre du vocabulaire. */
  AMBIGUOUS_EMOTION: { readonly word: string; readonly candidates: readonly string[] };
  /** Un mot suivi d'une intensité ne correspond à aucune émotion : création d'une émotion personnalisée. */
  UNKNOWN_EMOTION: { readonly word: string };
  /** Ressenti sans intensité (le contrat l'exige). */
  MISSING_INTENSITY: { readonly min: number; readonly max: number };
  /** Intensité lue hors des bornes du contrat ; elle n'est pas retenue. */
  INTENSITY_OUT_OF_RANGE: { readonly value: number; readonly min: number; readonly max: number };
  /** `>` sans rien derrière. */
  EMPTY_TARGET: Record<string, never>;
  /** Guillemet ouvrant sans fermant : la suite est lue comme du texte littéral. */
  UNCLOSED_QUOTE: { readonly quote: string; readonly index: number };
  /** Plusieurs dates reconnues : la première est retenue, les autres restent dans le texte. */
  AMBIGUOUS_DATE: { readonly used: string; readonly ignored: readonly string[] };
  /** Date explicite impossible (« 31 février ») : laissée dans le texte. */
  INVALID_DATE: { readonly expression: string };
  /** Date retenue dans le futur (après aujourd'hui dans le fuseau du praticien). */
  FUTURE_DATE: { readonly expression: string };
  /** Texte vide pour un type qui l'exige (note : body ; événement, situation : title ; médicament : molecule). */
  EMPTY_TEXT: Record<string, never>;
  /** Fuseau injecté inconnu : UTC est utilisé. */
  INVALID_TIME_ZONE: { readonly timeZone: string };
}

export type ParseWarningCode = keyof ParseWarningParams;

/**
 * Code du message d'aide associé à chaque avertissement (une aide par ambiguïté). Les libellés sont
 * écrits en $localize par la barre de commande (M6-02), jamais ici.
 */
export const PARSE_HINTS = {
  UNKNOWN_PREFIX: 'USE_KNOWN_PREFIX',
  AMBIGUOUS_EMOTION: 'PICK_EMOTION',
  UNKNOWN_EMOTION: 'CREATE_CUSTOM_EMOTION',
  MISSING_INTENSITY: 'ADD_INTENSITY',
  INTENSITY_OUT_OF_RANGE: 'USE_INTENSITY_RANGE',
  EMPTY_TARGET: 'TYPE_TARGET_AFTER_GT',
  UNCLOSED_QUOTE: 'CLOSE_QUOTE',
  AMBIGUOUS_DATE: 'KEEP_ONE_DATE',
  INVALID_DATE: 'CHECK_DATE',
  FUTURE_DATE: 'CHECK_FUTURE_DATE',
  EMPTY_TEXT: 'ADD_TEXT',
  INVALID_TIME_ZONE: 'CHECK_TIME_ZONE',
} as const satisfies Record<ParseWarningCode, string>;

export type ParseHint = (typeof PARSE_HINTS)[ParseWarningCode];

/** Un avertissement : code stable, code d'aide, paramètres typés selon le code. */
export type ParseWarning = {
  [C in ParseWarningCode]: {
    readonly code: C;
    readonly hint: (typeof PARSE_HINTS)[C];
    readonly params: ParseWarningParams[C];
  };
}[ParseWarningCode];

export interface ParseResult {
  readonly type: CaptureEntryType;
  /** Code de l'émotion reconnue (ressenti seulement). */
  readonly emotionCode?: string;
  /** Intensité lue, dans les bornes du contrat (ressenti seulement). */
  readonly intensity?: number;
  /** Le reste de la saisie, espaces normalisés, sans les jetons consommés (titre, corps ou molécule). */
  readonly text: string;
  readonly occurred: ParsedOccurred;
  /** Entrée à lier, d'après ce qui suit le dernier `>` hors guillemets. */
  readonly target?: ParseTarget;
  readonly warnings: readonly ParseWarning[];
}
