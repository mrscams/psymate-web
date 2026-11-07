import { HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, firstValueFrom, map, Observable } from 'rxjs';

import {
  DecisionDto,
  DocumentDto,
  ProfessionalInfoDto,
  ProfessionalInfoRequest,
  VerificationDto,
  VerificationDuPraticienService,
} from '../../../api';
import { Profession, VerificationStatus } from '../../../core/auth';

/** Nature d'un justificatif (contrat : type de DocumentDto). */
export type DocumentType =
  'diploma' | 'registration' | 'certification' | 'professional_card' | 'identity' | 'other';

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'diploma',
  'registration',
  'certification',
  'professional_card',
  'identity',
  'other',
];

export type ReviewStatus = 'pending' | 'conform' | 'non_conform';

/** Taille maximale d'un justificatif (contrat : 10 Mo). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Types MIME acceptés par le serveur (reconnus d'après le contenu, jamais l'extension). */
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export interface VerificationDocument {
  id: string;
  type: DocumentType;
  title: string;
  issuer: string | null;
  year: number | null;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
  reviewedStatus: ReviewStatus;
  purged: boolean;
}

export interface ProfessionalAddress {
  street: string;
  postalCode: string;
  city: string;
}

export interface ProfessionalInfo {
  professionalNumber: string;
  phone: string;
  remoteOnly: boolean;
  address: ProfessionalAddress;
}

/** Modèle de vue du dossier professionnel (GET /api/me/verification). */
export interface Verification {
  status: VerificationStatus;
  profession: Profession | null;
  submittedAt: string | null;
  /** Dernier message d'un administrateur (décision needs_more la plus récente), fiche 13. */
  adminMessage: string | null;
  decidedAt: string | null;
  documents: VerificationDocument[];
  /** Types obligatoires absents (diploma, identity), calculés par le serveur (G Q14). */
  missing: DocumentType[];
  /** Types conseillés absents, selon la profession (registration, certification). */
  recommended: DocumentType[];
  professionalInfo: ProfessionalInfo;
}

/** Métadonnées saisies avec le fichier (fiche 13, formulaire d'ajout). */
export interface DocumentUploadInput {
  type: DocumentType;
  title: string;
  issuer: string;
  year: string;
}

export type UploadEvent =
  { kind: 'progress'; percent: number } | { kind: 'done'; document: VerificationDocument };

/** Mise à jour partielle (PATCH) : un champ absent est inchangé, une chaîne vide l'efface. */
export type ProfessionalInfoPatch = Partial<ProfessionalInfo>;

/** Service de données du dossier professionnel : seul fichier de features/account qui importe le client généré. */
@Injectable({ providedIn: 'root' })
export class VerificationApi {
  private readonly service = inject(VerificationDuPraticienService);

  /** GET /api/me/verification. */
  async load(): Promise<Verification> {
    return toVerification(await firstValueFrom(this.service.getVerification()));
  }

  /**
   * POST /api/me/verification/documents (multipart). Émet la progression de l'envoi puis le
   * justificatif créé ; les erreurs (409, 413, 415, 422…) arrivent en ApiProblem.
   */
  upload(input: DocumentUploadInput, file: File): Observable<UploadEvent> {
    return this.service
      .uploadDocument(
        input.type,
        input.title,
        input.issuer || undefined,
        input.year || undefined,
        file,
        'events',
        true,
      )
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event): UploadEvent => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            return {
              kind: 'progress',
              percent: total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0,
            };
          }
          if (event.type === HttpEventType.Response) {
            return { kind: 'done', document: toDocument(event.body ?? {}) };
          }
          return { kind: 'progress', percent: 0 };
        }),
      );
  }

  /** DELETE /api/me/verification/documents/{id} → 204 (409 hors docs_pending / needs_more). */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.service.deleteDocument(id));
  }

  /** GET /api/me/verification/documents/{id}/url : chemin signé 5 min, même session. */
  async documentUrl(id: string): Promise<string> {
    const signed = await firstValueFrom(this.service.getDocumentUrl(id));
    return signed.url ?? '';
  }

  /** POST /api/me/verification/submit → dossier under_review (409 VERIFICATION_INCOMPLETE sinon). */
  async submit(): Promise<Verification> {
    return toVerification(await firstValueFrom(this.service.submitVerification()));
  }

  /** PATCH /api/me/professional-info ; renvoie les informations enregistrées. */
  async updateInfo(patch: ProfessionalInfoPatch): Promise<ProfessionalInfo> {
    const body: ProfessionalInfoRequest = {};
    if (patch.professionalNumber !== undefined) body.professionalNumber = patch.professionalNumber;
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (patch.remoteOnly !== undefined) body.remoteOnly = patch.remoteOnly;
    if (patch.address !== undefined) body.address = { ...patch.address };
    return toInfo(await firstValueFrom(this.service.updateProfessionalInfo(body)));
  }
}

function toVerification(dto: VerificationDto): Verification {
  const decisions = dto.decisions ?? [];
  const last = lastDecision(decisions);
  return {
    status: (dto.status as VerificationStatus | undefined) ?? 'docs_pending',
    profession: (dto.profession as Profession | undefined) ?? null,
    submittedAt: dto.submittedAt ?? null,
    adminMessage: last?.kind === 'needs_more' ? (last.message ?? null) : null,
    decidedAt: last?.decidedAt ?? null,
    documents: (dto.documents ?? []).map(toDocument),
    missing: (dto.missing ?? []).filter(isDocumentType),
    recommended: (dto.recommended ?? []).filter(isDocumentType),
    professionalInfo: toInfo(dto.professionalInfo ?? {}),
  };
}

function lastDecision(decisions: DecisionDto[]): DecisionDto | null {
  if (decisions.length === 0) return null;
  return [...decisions].sort((a, b) => (a.decidedAt ?? '').localeCompare(b.decidedAt ?? ''))[
    decisions.length - 1
  ];
}

function toDocument(dto: DocumentDto): VerificationDocument {
  return {
    id: dto.id ?? '',
    type: isDocumentType(dto.type) ? dto.type : 'other',
    title: dto.title ?? '',
    issuer: dto.issuer ?? null,
    year: dto.year ?? null,
    mime: dto.mime ?? '',
    sizeBytes: dto.sizeBytes ?? 0,
    uploadedAt: dto.uploadedAt ?? '',
    reviewedStatus: (dto.reviewedStatus as ReviewStatus | undefined) ?? 'pending',
    purged: dto.purged ?? false,
  };
}

function toInfo(dto: ProfessionalInfoDto): ProfessionalInfo {
  return {
    professionalNumber: dto.professionalNumber ?? '',
    phone: dto.phone ?? '',
    remoteOnly: dto.remoteOnly ?? false,
    address: {
      street: dto.address?.street ?? '',
      postalCode: dto.address?.postalCode ?? '',
      city: dto.address?.city ?? '',
    },
  };
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}
