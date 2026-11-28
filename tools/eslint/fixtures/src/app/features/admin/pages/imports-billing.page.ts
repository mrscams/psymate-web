// expect: boundaries/dependencies
// Violation (M15-14, G Q68) : features/admin importe la facturation, même par son index public ;
// billing porte des données de patients, l'administration n'y accède jamais.
import { BILLING_ROUTES } from '../../billing/index';

export const ADMIN_BILLING = BILLING_ROUTES;
