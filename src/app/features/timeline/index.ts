// Surface publique de features/timeline (handbook §4, §5) : la page de l'onglet 2 du dossier
// (/patients/:id/timeline), chargée à la demande par les routes de features/patient-shell, et le
// paramètre qui y cible une entrée (?focus=<id>).
export { TimelinePage } from './pages/timeline.page';
export { TIMELINE_FOCUS_PARAM } from './timeline.params';
