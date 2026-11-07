// expect: boundaries/dependencies
// Violation : features/admin importe une feature patient, même par son index public.
import { PATIENTS_ROUTES } from '../../patients/index';

export const ADMIN_PAGE = PATIENTS_ROUTES;
