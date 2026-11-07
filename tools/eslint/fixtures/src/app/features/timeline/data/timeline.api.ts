// expect: none
// Permis : le service de données est le seul à lire src/app/api.
import type { PatientDto } from '../../../api/model';

export type TimelineApiPatient = PatientDto;
