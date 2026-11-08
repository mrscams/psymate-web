// Surface publique de features/capture (handbook §4, §5). M6-01 : la grammaire de la barre de
// commande (B5, alternative A), un parseur pur sans DOM ni Angular. La barre elle-même, son aperçu et
// son CaptureStore viennent avec M6-02.
export { CAPTURE_PREFIXES, parse } from './parser/parse';
export { INTENSITY_MAX, INTENSITY_MIN, PARSE_HINTS } from './parser/parse.types';
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
