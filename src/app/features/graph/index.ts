// Surface publique de features/graph (handbook §4, §5) :
// - l'éditeur de lien (fiche 06, M2-04), que le dossier patient ouvre (touche L sur l'entrée
//   ouverte, `?link=<entryId>`), comme la timeline, le rail « Lié à » (M2-05) et la vue graphe ;
// - loadGraphPage : chargement paresseux de la vue graphe (fiche 04, M2-06), pour la route enfant
//   `graph` du shell patient. Import dynamique : la page (et Cytoscape, en @defer dans la page)
//   reste dans son propre morceau même si entries ou le shell importent cet index.
export type { EntryLink, LinkTypeCode, LinkTypeOption } from './data/link.model';
// Matrice E5.3 (G Q12) : le rail « Lié à… » de l'éditeur d'entrée (M2-05) propose ses types avec la
// même règle que les puces de l'éditeur de lien.
export { isAllowed } from './data/link.model';
export type {
  LinkEditorPatient,
  LinkEditorResult,
  OpenLinkEditorOptions,
} from './link-editor.launcher';
export { connectLinkEditor, LINK_QUERY_PARAM, openLinkEditor } from './link-editor.launcher';

export const loadGraphPage = () => import('./pages/graph.page').then((m) => m.GraphPage);
