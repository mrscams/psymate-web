// Surface publique de features/patient-shell (handbook §4, §5, §7) : ses routes, et ce que les
// onglets du dossier (overview, timeline, graph, search, entries) utilisent : le PatientShellStore
// (patient, séance en cours ou dernière, rememberTab / recallTab), fourni par la page du shell.
export type { ShellPatient, ShellSession, ShellTab } from './data/patient-shell.model';
export type { ShellStatus } from './data/patient-shell.store';
export { PatientShellStore } from './data/patient-shell.store';
export { PATIENT_SHELL_ROUTES } from './patient-shell.routes';
// Arrivée depuis la création d'un patient : la barre de capture prend le focus (B3 flux 2).
export { CAPTURE_FOCUS_STATE } from './patient-shell.params';
// Aide des raccourcis (planche 29 §6, M7-03) : `pm-shortcuts-help` branche la touche ? (posé une fois
// par app.component) ; ShortcutsHelp l'ouvre depuis une autre feature (« Voir les raccourcis »).
// L'index reste léger : la page du shell est chargée à la demande par ses routes.
export { ShortcutsHelp, ShortcutsHelpComponent } from './shortcuts-help';
