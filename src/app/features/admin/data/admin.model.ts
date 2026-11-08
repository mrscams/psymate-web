// Modèles de vue de features/admin (fiches 20, 21, 22, 28) : ce que voient stores et composants,
// traduit des DTO du contrat par admin.api.ts. Aucune donnée patient (fiche 20, C6).

export type Profession = 'psychologist' | 'psychiatrist' | 'coach';

export type VerificationStatus =
  | 'email_pending'
  | 'docs_pending'
  | 'under_review'
  | 'approved'
  | 'needs_more'
  | 'rejected'
  | 'suspended'
  | 'closed';

export type AccountRole = 'practitioner' | 'admin';

// ---------------------------------------------------------------- Validation (fiche 20)

/** File de vérification : under_review (défaut) ou needs_more (contrat : pas de « traités »). */
export type QueueStatus = 'under_review' | 'needs_more';
export const QUEUE_STATUSES: readonly QueueStatus[] = ['under_review', 'needs_more'];

export interface QueueItem {
  practitionerId: string;
  displayName: string;
  profession: Profession;
  city: string | null;
  documentsCount: number;
  submittedAt: string | null;
  overdue: boolean;
  /** Types de pièces obligatoires absentes (diploma, identity). */
  missingHints: string[];
}

export type ReviewedStatus = 'pending' | 'conform' | 'non_conform';

export type DocumentMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface DossierDocument {
  id: string;
  type: string;
  title: string;
  issuer: string | null;
  year: number | null;
  mime: DocumentMime;
  sizeBytes: number;
  uploadedAt: string | null;
  reviewedStatus: ReviewedStatus;
  purged: boolean;
}

export type DecisionKind =
  | 'approved'
  | 'needs_more'
  | 'rejected'
  | 'suspended'
  | 'reactivated'
  | 'appeal_accepted'
  | 'appeal_rejected'
  | 'report_resolved';

export interface DecisionItem {
  id: string;
  kind: DecisionKind;
  decidedAt: string | null;
  internalNote: string | null;
  messageToPractitioner: string | null;
}

export interface Dossier {
  practitionerId: string;
  displayName: string;
  email: string;
  profession: Profession;
  verificationStatus: VerificationStatus;
  createdAt: string | null;
  emailConfirmedAt: string | null;
  submittedAt: string | null;
  overdue: boolean;
  phone: string | null;
  professionalNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  remoteOnly: boolean;
  documents: DossierDocument[];
  decisions: DecisionItem[];
}

/** Issue d'une décision sur un dossier (POST …/decision). */
export type VerificationDecision = 'approved' | 'needs_more' | 'rejected';

export interface DecisionInput {
  kind: VerificationDecision;
  internalNote: string;
  messageToPractitioner: string;
  checklist: Record<string, boolean>;
  force: boolean;
}

/** URL signée de 5 minutes (chemin relatif de l'API) et son échéance. */
export interface SignedUrl {
  url: string;
  expiresAt: string | null;
}

// ---------------------------------------------------------------- Praticiens (fiche 21)

export interface AccountItem {
  id: string;
  displayName: string;
  email: string;
  profession: Profession;
  city: string | null;
  role: AccountRole;
  status: VerificationStatus;
  statusSince: string | null;
  overdue: boolean;
  twoFactorEnabled: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  purgeAt: string | null;
}

/** Statuts comptés par l'API (onglets de la fiche 21). */
export type CountedStatus = 'approved' | 'under_review' | 'needs_more' | 'suspended' | 'rejected';
export const COUNTED_STATUSES: readonly CountedStatus[] = [
  'approved',
  'under_review',
  'needs_more',
  'suspended',
  'rejected',
];
export type StatusCounts = Record<CountedStatus, number>;

export interface AccountPage {
  items: AccountItem[];
  nextCursor: string | null;
  counts: StatusCounts;
}

export interface AccountQuery {
  q: string;
  status: CountedStatus | null;
  role: AccountRole | null;
  profession: Profession | null;
  cursor: string | null;
  limit?: number;
}

export type AppealOutcome = 'accepted' | 'dismissed';

export interface Appeal {
  id: string;
  practitionerId: string;
  practitionerDisplayName: string;
  decisionKind: 'rejected' | 'suspended';
  message: string;
  submittedAt: string | null;
  outcome: AppealOutcome | null;
}

// ---------------------------------------------------------------- Journal (fiche 22)

export type ActorType = 'admin' | 'practitioner' | 'system';

export interface JournalItem {
  id: string;
  at: string;
  kind: string;
  source: 'security_event' | 'verification_decision';
  actorType: ActorType;
  actorName: string | null;
  practitionerId: string | null;
  practitionerDisplayName: string | null;
  summary: string;
}

export interface JournalQuery {
  kind: string | null;
  actorId: string | null;
  practitionerId: string | null;
  from: string | null;
  to: string | null;
  cursor: string | null;
}

// ---------------------------------------------------------------- Vocabulaire (fiche 28)

/** Types administrables par l'endpoint (fiche 28 : modalités et langues en lecture seule). */
export type EditableKind = 'specialty' | 'audience';
export const EDITABLE_KINDS: readonly EditableKind[] = ['specialty', 'audience'];

export interface VocabularyEntry {
  kind: EditableKind;
  code: string;
  labelFr: string;
  labelEn: string | null;
  sortOrder: number;
  active: boolean;
  usedByPublishedProfiles: number;
}

/** Entrée d'une liste fixe (modalités, langues), lue dans GET /api/vocabulary/directory. */
export interface FixedEntry {
  code: string;
  labelFr: string;
  labelEn: string | null;
}

export interface FixedVocabulary {
  modalities: FixedEntry[];
  languages: FixedEntry[];
}

export interface VocabularyCreateInput {
  kind: EditableKind;
  code: string;
  labelFr: string;
  labelEn?: string;
}

export interface VocabularyPatch {
  labelFr?: string;
  labelEn?: string;
  sortOrder?: number;
  active?: boolean;
}
