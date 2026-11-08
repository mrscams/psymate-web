// Surface publique de features/entries (handbook §4, §5) : l'éditeur d'entrée (fiche 05) que le
// dossier patient ouvre (touche N, bouton +, barre de capture, `?entry=<id>` pour une correction).
// Pas de route : l'éditeur est un panneau latéral par-dessus /patients/:id/*.
export type { OpenEntryEditorOptions, SavedEntry } from './entry-editor.launcher';
export { ENTRY_QUERY_PARAM, openEntryEditor } from './entry-editor.launcher';
// Barre de commande (features/capture, M6-02) : le même rail « Lié à… », les mêmes règles de liens
// (matrice E5.3) et le même corps de POST que l'éditeur, depuis la saisie interprétée.
export type {
  CreateEntryBody,
  Emotion,
  EmotionFamily,
  EntryPrefill,
  LinkCandidate,
  LinkChoice,
  RailLink,
} from './data/entry.model';
export {
  draftFromPrefill,
  EMOTION_FAMILIES,
  linkChoices,
  railCandidates,
  toCreateBody,
} from './data/entry.model';
export { familyLabel } from './ui/entry-labels';
export { candidateName, LinkRailComponent } from './ui/link-rail.component';
