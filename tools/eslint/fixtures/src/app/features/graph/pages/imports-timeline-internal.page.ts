// expect: boundaries/dependencies
// Violation : une feature importe l'intérieur d'une autre (et non son index.ts).
import { TIMELINE_CARD } from '../../timeline/ui/timeline-card';

export const GRAPH_PAGE = TIMELINE_CARD;
