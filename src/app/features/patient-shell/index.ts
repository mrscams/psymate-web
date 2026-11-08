// Surface publique de features/patient-shell (handbook §4, §5, §7) : ses routes, et ce que les
// onglets du dossier (overview, timeline, graph, search, entries) utilisent : le PatientShellStore
// (patient, séance en cours ou dernière, rememberTab / recallTab), fourni par la page du shell.
export type { ShellPatient, ShellSession, ShellTab } from './data/patient-shell.model';
export type { ShellStatus } from './data/patient-shell.store';
export { PatientShellStore } from './data/patient-shell.store';
export { PATIENT_SHELL_ROUTES } from './patient-shell.routes';
