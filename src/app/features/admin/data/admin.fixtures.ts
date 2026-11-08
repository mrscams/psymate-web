// Données fictives des tests de features/admin (jamais importées par l'application).
import {
  AccountItem,
  AccountPage,
  Appeal,
  Dossier,
  DossierDocument,
  JournalItem,
  QueueItem,
  VocabularyEntry,
} from './admin.model';

export function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    practitionerId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Claire Moreau',
    profession: 'psychologist',
    city: 'Lyon',
    documentsCount: 2,
    submittedAt: '2026-11-05T09:00:00Z',
    overdue: false,
    missingHints: [],
    ...overrides,
  };
}

export const CLAIRE = queueItem();
export const REMI = queueItem({
  practitionerId: '22222222-2222-4222-8222-222222222222',
  displayName: 'Rémi Lenoir',
  profession: 'psychiatrist',
  city: 'Villeurbanne',
  overdue: true,
  missingHints: ['identity'],
});

export function documentOf(overrides: Partial<DossierDocument> = {}): DossierDocument {
  return {
    id: 'doc-diploma',
    type: 'diploma',
    title: 'Master 2 Psychologie clinique',
    issuer: 'Université Lyon 2',
    year: 2019,
    mime: 'application/pdf',
    sizeBytes: 245_760,
    uploadedAt: '2026-11-04T10:00:00Z',
    reviewedStatus: 'pending',
    purged: false,
    ...overrides,
  };
}

export function dossierOf(overrides: Partial<Dossier> = {}): Dossier {
  return {
    practitionerId: CLAIRE.practitionerId,
    displayName: 'Claire Moreau',
    email: 'claire.moreau@example.test',
    profession: 'psychologist',
    verificationStatus: 'under_review',
    createdAt: '2026-11-01T08:00:00Z',
    emailConfirmedAt: '2026-11-01T08:05:00Z',
    submittedAt: '2026-11-05T09:00:00Z',
    overdue: false,
    phone: '+33600000099',
    professionalNumber: '10101010101',
    street: '12 rue des Lilas',
    postalCode: '69001',
    city: 'Lyon',
    remoteOnly: false,
    documents: [
      documentOf(),
      documentOf({
        id: 'doc-identity',
        type: 'identity',
        title: "Carte d'identité",
        issuer: null,
        year: null,
        mime: 'image/png',
      }),
    ],
    decisions: [],
    ...overrides,
  };
}

export function account(overrides: Partial<AccountItem> = {}): AccountItem {
  return {
    id: 'acc-1',
    displayName: 'Claire Moreau',
    email: 'claire.moreau@example.test',
    profession: 'psychologist',
    city: 'Lyon',
    role: 'practitioner',
    status: 'approved',
    statusSince: '2026-11-06T09:00:00Z',
    overdue: false,
    twoFactorEnabled: true,
    createdAt: '2026-11-01T08:00:00Z',
    lastLoginAt: '2026-11-07T08:00:00Z',
    suspendedAt: null,
    purgeAt: null,
    ...overrides,
  };
}

export function accountPage(items: AccountItem[], nextCursor: string | null = null): AccountPage {
  return {
    items,
    nextCursor,
    counts: { approved: 3, under_review: 2, needs_more: 1, suspended: 1, rejected: 0 },
  };
}

export function appeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 'appeal-1',
    practitionerId: 'acc-2',
    practitionerDisplayName: 'Rémi Lenoir',
    decisionKind: 'suspended',
    message: 'Le diplôme transmis est bien celui de mon établissement.',
    submittedAt: '2026-11-06T09:00:00Z',
    outcome: null,
    ...overrides,
  };
}

export function journalItem(overrides: Partial<JournalItem> = {}): JournalItem {
  return {
    id: 'j-1',
    at: '2026-11-07T10:15:42Z',
    kind: 'admin.document_read',
    source: 'security_event',
    actorType: 'admin',
    actorName: 'Hugo Admin',
    practitionerId: 'acc-1',
    practitionerDisplayName: 'Claire Moreau',
    summary: 'admin.document_read',
    ...overrides,
  };
}

export function entry(overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    kind: 'specialty',
    code: 'anxiety',
    labelFr: 'Anxiété',
    labelEn: 'Anxiety',
    sortOrder: 1,
    active: true,
    usedByPublishedProfiles: 0,
    ...overrides,
  };
}
