// expect: none
// Permis : l'index.ts public d'une autre feature, et les fichiers de sa propre feature.
import { TIMELINE_ROUTES } from '../../timeline/index';
import { GRAPH_PAGE } from './imports-timeline-internal.page';

export const GRAPH_ROUTES = [TIMELINE_ROUTES, GRAPH_PAGE];
