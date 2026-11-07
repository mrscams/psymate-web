// expect: boundaries/dependencies
// Violation : le client généré n'est importé que depuis data/<x>.api.ts.
import type { PatientDto } from '../../../api/model';

export type TimelinePatient = PatientDto;
