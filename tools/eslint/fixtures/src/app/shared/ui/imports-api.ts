// expect: boundaries/dependencies
// Violation : seul un data/*.api.ts importe le client genere, jamais shared.
import type { PatientDto } from '../../api/model';

export type SharedPatient = PatientDto;
