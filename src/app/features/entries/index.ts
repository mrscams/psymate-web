// Surface publique de features/entries (handbook §4, §5) : l'éditeur d'entrée (fiche 05) que le
// dossier patient ouvre (touche N, bouton +, barre de capture, `?entry=<id>` pour une correction).
// Pas de route : l'éditeur est un panneau latéral par-dessus /patients/:id/*.
export type { OpenEntryEditorOptions, SavedEntry } from './entry-editor.launcher';
export { ENTRY_QUERY_PARAM, openEntryEditor } from './entry-editor.launcher';
