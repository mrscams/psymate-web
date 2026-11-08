// expect: boundaries/dependencies
// Violation (M7-07, C6) : un service de données de features/admin lit l'intérieur d'une feature
// patient ; l'administration n'accède jamais aux données patients, même par un service.
import { PATIENT_ROW } from '../../patients/ui/patient-row';

export const ADMIN_DATA = PATIENT_ROW;
