// Surface publique de features/graph (handbook §4, §5) : pour l'instant l'éditeur de lien (fiche 06,
// M2-04), que le dossier patient ouvre (touche L sur l'entrée ouverte, `?link=<entryId>`) et que la
// timeline (M3-02), le rail « Lié à » (M2-05) et la vue graphe (M2-06) ouvriront. La page graphe
// (M2-06) viendra s'ajouter ici. Pas de route : l'éditeur est un panneau latéral.
export type { EntryLink, LinkTypeCode } from './data/link.model';
export type {
  LinkEditorPatient,
  LinkEditorResult,
  OpenLinkEditorOptions,
} from './link-editor.launcher';
export { connectLinkEditor, LINK_QUERY_PARAM, openLinkEditor } from './link-editor.launcher';
