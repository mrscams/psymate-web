import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AccountItemDto,
  AdministrationJournalService,
  AdministrationPraticiensService,
  AdministrationVerificationsService,
  AdministrationVocabulaireDeLannuaireService,
  AdminDocumentDto,
  AnnuairePublicService,
  AppealDecisionRequestOutcomeEnum,
  AppealItemDto,
  CreateRequestKindEnum,
  DecisionItemDto,
  DecisionRequestKindEnum,
  DossierDto,
  Item,
  ItemDto,
  JournalItemDto,
  QueueItemDto,
  RecoursService,
  ReviewRequestReviewedStatusEnum,
} from '../../../api';
import { CursorPage } from '../../../shared/util';
import {
  AccountItem,
  AccountPage,
  AccountQuery,
  Appeal,
  AppealOutcome,
  COUNTED_STATUSES,
  DecisionInput,
  DecisionItem,
  DecisionKind,
  Dossier,
  DossierDocument,
  EditableKind,
  FixedEntry,
  FixedVocabulary,
  JournalItem,
  JournalQuery,
  QueueItem,
  QueueStatus,
  ReviewedStatus,
  SignedUrl,
  StatusCounts,
  VocabularyCreateInput,
  VocabularyEntry,
  VocabularyPatch,
} from './admin.model';

/** Taille d'une page des listes paginées (le contrat accepte 1..200, 50 par défaut). */
export const ADMIN_PAGE_SIZE = 50;

/**
 * Service de données de features/admin (handbook §2, couche 4) : le seul fichier de la feature qui
 * importe le client généré (vérifications, praticiens, recours, journal, vocabulaire de l'annuaire).
 * Traduit les DTO en modèles de vue ; les erreurs arrivent déjà en ApiProblem (core/http). Aucune
 * route patient n'est appelée d'ici (fiche 20 : l'administration ne voit aucune donnée patient).
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly verifications = inject(AdministrationVerificationsService);
  private readonly practitioners = inject(AdministrationPraticiensService);
  private readonly appealsApi = inject(RecoursService);
  private readonly journalApi = inject(AdministrationJournalService);
  private readonly vocabularyApi = inject(AdministrationVocabulaireDeLannuaireService);
  private readonly publicDirectory = inject(AnnuairePublicService);

  // ------------------------------------------------------------ Vérifications (fiche 20)

  /** GET /api/admin/verifications : file du plus ancien au plus récent, par curseur. */
  async queue(status: QueueStatus, cursor: string | null): Promise<CursorPage<QueueItem>> {
    const page = await firstValueFrom(
      this.verifications.listAdminVerifications(
        status,
        'oldest',
        cursor ?? undefined,
        ADMIN_PAGE_SIZE,
      ),
    );
    return { items: (page.items ?? []).map(toQueueItem), nextCursor: page.nextCursor ?? null };
  }

  /** GET /api/admin/verifications/{id} : identité, coordonnées, justificatifs, décisions. */
  async dossier(practitionerId: string): Promise<Dossier> {
    return toDossier(await firstValueFrom(this.verifications.getAdminVerification(practitionerId)));
  }

  /** PATCH …/documents/{docId} {reviewedStatus} → justificatif à jour. */
  async reviewDocument(
    practitionerId: string,
    documentId: string,
    status: ReviewedStatus,
  ): Promise<DossierDocument> {
    const document = await firstValueFrom(
      this.verifications.reviewAdminDocument(practitionerId, documentId, {
        reviewedStatus: status as ReviewRequestReviewedStatusEnum,
      }),
    );
    return toDocument(document);
  }

  /** GET …/documents/{docId}/url : chemin relatif signé, 5 minutes, pour cet administrateur. */
  async documentUrl(practitionerId: string, documentId: string): Promise<SignedUrl> {
    const signed = await firstValueFrom(
      this.verifications.getAdminDocumentUrl(practitionerId, documentId),
    );
    return { url: signed.url ?? '', expiresAt: signed.expiresAt ?? null };
  }

  /**
   * GET …/documents/{docId}/file?exp&sig : le fichier lui-même, pour la visionneuse. Le serveur
   * l'envoie avec X-Frame-Options DENY : il ne peut pas être la source d'une iframe, il est donc lu
   * ici puis affiché par une URL blob (iframe native, aucune bibliothèque). Chaque lecture est
   * consignée par le serveur (document_access_log, admin.document_read).
   */
  async documentFile(practitionerId: string, documentId: string, signed: SignedUrl): Promise<Blob> {
    const query = new URL(signed.url, 'http://signed.invalid').searchParams;
    const exp = Number(query.get('exp'));
    return firstValueFrom(
      this.verifications.getAdminDocumentFile(
        practitionerId,
        documentId,
        Number.isFinite(exp) ? exp : undefined,
        query.get('sig') ?? undefined,
      ),
    );
  }

  /** POST …/decision : 201 avec la décision ; 409 ADMIN_APPROVAL_INCOMPLETE, 422 MESSAGE_REQUIRED… */
  async decide(practitionerId: string, input: DecisionInput): Promise<void> {
    const note = input.internalNote.trim();
    const message = input.messageToPractitioner.trim();
    await firstValueFrom(
      this.verifications.decideAdminVerification(practitionerId, {
        kind: input.kind as DecisionRequestKindEnum,
        checklist: input.checklist,
        ...(note ? { internalNote: note } : {}),
        // Le message part tel quel pour un complément ou un refus : le serveur juge (422 si vide).
        ...(input.kind !== 'approved' || message ? { messageToPractitioner: message } : {}),
        ...(input.force ? { force: true } : {}),
      }),
    );
  }

  // ------------------------------------------------------------ Praticiens (fiche 21)

  /** GET /api/admin/practitioners : page filtrée et compteurs par statut. */
  async accounts(query: AccountQuery): Promise<AccountPage> {
    const page = await firstValueFrom(
      this.practitioners.listAdminPractitioners(
        query.q.trim() || undefined,
        query.status ?? undefined,
        query.role ?? undefined,
        query.profession ?? undefined,
        query.cursor ?? undefined,
        query.limit ?? ADMIN_PAGE_SIZE,
      ),
    );
    return {
      items: (page.items ?? []).map(toAccount),
      nextCursor: page.nextCursor ?? null,
      counts: toCounts(page.counts),
    };
  }

  /** POST …/suspend {reason} : sessions révoquées, e-mail avec le motif. */
  async suspend(id: string, reason: string): Promise<void> {
    await firstValueFrom(this.practitioners.suspendAdminPractitioner(id, { reason }));
  }

  /** POST …/reactivate {reason} → nouveau statut (approved, docs_pending…). */
  async reactivate(id: string, reason: string): Promise<string> {
    const result = await firstValueFrom(
      this.practitioners.reactivateAdminPractitioner(id, { reason }),
    );
    return result.verificationStatus ?? '';
  }

  /** GET /api/admin/appeals?status=open : recours à examiner, du plus ancien au plus récent. */
  async openAppeals(cursor: string | null): Promise<CursorPage<Appeal>> {
    const page = await firstValueFrom(
      this.appealsApi.listAdminAppeals('open', cursor ?? undefined, ADMIN_PAGE_SIZE),
    );
    return { items: (page.items ?? []).map(toAppeal), nextCursor: page.nextCursor ?? null };
  }

  /** POST /api/admin/appeals/{id}/decision {outcome, messageToPractitioner}. */
  async decideAppeal(id: string, outcome: AppealOutcome, message: string): Promise<void> {
    await firstValueFrom(
      this.appealsApi.decideAdminAppeal(id, {
        outcome: outcome as AppealDecisionRequestOutcomeEnum,
        messageToPractitioner: message,
      }),
    );
  }

  // ------------------------------------------------------------ Journal (fiche 22)

  /** GET /api/admin/journal : du plus récent au plus ancien, filtres cumulables, par curseur. */
  async journal(query: JournalQuery): Promise<CursorPage<JournalItem>> {
    const page = await firstValueFrom(
      this.journalApi.listAdminJournal(
        query.kind ?? undefined,
        query.practitionerId ?? undefined,
        query.actorId ?? undefined,
        query.from ?? undefined,
        query.to ?? undefined,
        query.cursor ?? undefined,
        ADMIN_PAGE_SIZE,
      ),
    );
    return { items: (page.items ?? []).map(toJournalItem), nextCursor: page.nextCursor ?? null };
  }

  // ------------------------------------------------------------ Vocabulaire (fiche 28)

  /** GET /api/admin/vocabulary/directory : spécialités et publics, actifs ou non. */
  async vocabulary(): Promise<VocabularyEntry[]> {
    const list = await firstValueFrom(this.vocabularyApi.listAdminDirectoryVocabulary());
    return (list.items ?? []).map(toEntry);
  }

  /**
   * Modalités et langues (listes fixes, lecture seule) : GET /api/public/directory/vocabulary, même
   * contenu que la route des praticiens, sans session (la route praticien n'est pas documentée pour un admin).
   */
  async fixedVocabulary(): Promise<FixedVocabulary> {
    const lists = await firstValueFrom(this.publicDirectory.getPublicDirectoryVocabulary());
    return {
      modalities: (lists.modalities ?? []).map(toFixed),
      languages: (lists.languages ?? []).map(toFixed),
    };
  }

  /** POST : 201 entrée active ; 409 VOCABULARY_EXISTS ; 422 par champ. */
  async createEntry(input: VocabularyCreateInput): Promise<VocabularyEntry> {
    const labelEn = input.labelEn?.trim();
    return toEntry(
      await firstValueFrom(
        this.vocabularyApi.createAdminDirectoryVocabulary({
          kind: input.kind as CreateRequestKindEnum,
          code: input.code.trim(),
          labelFr: input.labelFr.trim(),
          ...(labelEn ? { labelEn } : {}),
        }),
      ),
    );
  }

  /** PATCH {kind}/{code} : partiel ; 409 VOCABULARY_IN_USE (usedByPublishedProfiles). */
  async patchEntry(
    kind: EditableKind,
    code: string,
    patch: VocabularyPatch,
  ): Promise<VocabularyEntry> {
    return toEntry(
      await firstValueFrom(this.vocabularyApi.updateAdminDirectoryVocabulary(kind, code, patch)),
    );
  }
}

function toQueueItem(dto: QueueItemDto): QueueItem {
  return {
    practitionerId: dto.practitionerId ?? '',
    displayName: dto.displayName ?? '',
    profession: dto.profession ?? 'psychologist',
    city: dto.city ?? null,
    documentsCount: dto.documentsCount ?? 0,
    submittedAt: dto.submittedAt ?? null,
    overdue: dto.overdue ?? false,
    missingHints: dto.missingHints ?? [],
  };
}

function toDocument(dto: AdminDocumentDto): DossierDocument {
  return {
    id: dto.id ?? '',
    type: dto.type ?? 'other',
    title: dto.title ?? '',
    issuer: dto.issuer ?? null,
    year: dto.year ?? null,
    mime: dto.mime ?? 'application/pdf',
    sizeBytes: dto.sizeBytes ?? 0,
    uploadedAt: dto.uploadedAt ?? null,
    reviewedStatus: dto.reviewedStatus ?? 'pending',
    purged: dto.purged ?? false,
  };
}

function toDecision(dto: DecisionItemDto): DecisionItem {
  return {
    id: dto.id ?? '',
    kind: (dto.kind ?? 'approved') as DecisionKind,
    decidedAt: dto.decidedAt ?? null,
    internalNote: dto.internalNote ?? null,
    messageToPractitioner: dto.messageToPractitioner ?? null,
  };
}

function toDossier(dto: DossierDto): Dossier {
  const contact = dto.contact;
  return {
    practitionerId: dto.practitionerId ?? '',
    displayName: dto.displayName ?? '',
    email: dto.email ?? '',
    profession: dto.profession ?? 'psychologist',
    verificationStatus: dto.verificationStatus ?? 'under_review',
    createdAt: dto.createdAt ?? null,
    emailConfirmedAt: dto.emailConfirmedAt ?? null,
    submittedAt: dto.submittedAt ?? null,
    overdue: dto.overdue ?? false,
    phone: contact?.phone ?? null,
    professionalNumber: contact?.professionalNumber ?? null,
    street: contact?.address?.street ?? null,
    postalCode: contact?.address?.postalCode ?? null,
    city: contact?.address?.city ?? null,
    remoteOnly: contact?.remoteOnly ?? false,
    documents: (dto.documents ?? []).map(toDocument),
    decisions: (dto.decisions ?? []).map(toDecision),
  };
}

function toAccount(dto: AccountItemDto): AccountItem {
  return {
    id: dto.id ?? '',
    displayName: dto.displayName ?? '',
    email: dto.email ?? '',
    profession: dto.profession ?? 'psychologist',
    city: dto.city ?? null,
    role: dto.role ?? 'practitioner',
    status: dto.verification?.status ?? 'docs_pending',
    statusSince: dto.verification?.since ?? null,
    overdue: dto.verification?.overdue ?? false,
    twoFactorEnabled: dto.twoFactorEnabled ?? false,
    createdAt: dto.createdAt ?? null,
    lastLoginAt: dto.lastLoginAt ?? null,
    suspendedAt: dto.suspendedAt ?? null,
    purgeAt: dto.purgeAt ?? null,
  };
}

function toCounts(counts: Record<string, number> | undefined): StatusCounts {
  return Object.fromEntries(
    COUNTED_STATUSES.map((status) => [status, counts?.[status] ?? 0]),
  ) as StatusCounts;
}

function toAppeal(dto: AppealItemDto): Appeal {
  return {
    id: dto.id ?? '',
    practitionerId: dto.practitionerId ?? '',
    practitionerDisplayName: dto.practitionerDisplayName ?? '',
    decisionKind: dto.decisionKind ?? 'suspended',
    message: dto.message ?? '',
    submittedAt: dto.submittedAt ?? null,
    outcome: dto.outcome ?? null,
  };
}

function toJournalItem(dto: JournalItemDto): JournalItem {
  return {
    id: dto.id ?? '',
    at: dto.at ?? '',
    kind: dto.kind ?? '',
    source: dto.source ?? 'security_event',
    actorType: dto.actorType ?? 'system',
    actorName: dto.actor?.displayName ?? null,
    practitionerId: dto.practitionerId ?? null,
    practitionerDisplayName: dto.practitionerDisplayName ?? null,
    summary: dto.summary ?? dto.kind ?? '',
  };
}

function toEntry(dto: ItemDto): VocabularyEntry {
  return {
    kind: dto.kind ?? 'specialty',
    code: dto.code ?? '',
    labelFr: dto.labelFr ?? '',
    labelEn: dto.labelEn ?? null,
    sortOrder: dto.sortOrder ?? 0,
    active: dto.active ?? true,
    usedByPublishedProfiles: dto.usedByPublishedProfiles ?? 0,
  };
}

function toFixed(item: Item): FixedEntry {
  return { code: item.code ?? '', labelFr: item.labelFr ?? '', labelEn: item.labelEn ?? null };
}
