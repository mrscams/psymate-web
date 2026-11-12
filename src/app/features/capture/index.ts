// Surface publique de features/capture (handbook §4, §5). M6-01 : la grammaire de la barre de
// commande (B5, alternative A), un parseur pur sans DOM ni Angular. M6-02 puis UX-S1 : le bloc de
// saisie structuré (pm-capture-block : puces de type, champs du type, rangée « Lié à », et son
// CaptureStore), que le dossier patient pose dans l'emplacement [pmCapture] de l'en-tête.
export type { CapturedEntry } from './data/capture.model';
export { CaptureBlockComponent } from './ui/capture-block.component';
export { CAPTURE_PREFIXES, parse } from './parser/parse';
export { BLOCKING_WARNINGS, INTENSITY_MAX, INTENSITY_MIN, PARSE_HINTS } from './parser/parse.types';
export type {
  CaptureEntryType,
  CapturePrecision,
  EmotionOption,
  ParsedOccurred,
  ParseHint,
  ParseOptions,
  ParseResult,
  ParseTarget,
  ParseWarning,
  ParseWarningCode,
  ParseWarningParams,
} from './parser/parse.types';
