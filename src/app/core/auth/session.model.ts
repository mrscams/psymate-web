/** Statut de vérification du praticien (MeResponse.verificationStatus). */
export type VerificationStatus =
  | 'email_pending'
  | 'docs_pending'
  | 'under_review'
  | 'approved'
  | 'needs_more'
  | 'rejected'
  | 'suspended'
  | 'closed';

export type Role = 'practitioner' | 'admin';

export type Profession = 'psychologist' | 'psychiatrist' | 'coach';

/**
 * Modèle de vue du compte connecté (GET /api/auth/me, réponse 200 de POST /api/auth/login).
 * Le client ne garde aucun jeton : la session vit dans un cookie HttpOnly (G Q6).
 */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  profession: Profession | null;
  verificationStatus: VerificationStatus | null;
  role: Role;
  twoFactorEnabled: boolean;
  passwordChangeRequired: boolean;
}
