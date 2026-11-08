import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ExportDeCompteService,
  ExportPatientService,
  ExportRequestedDto,
  PatientDto,
  PatientsService,
} from '../../../api';
import { ApiProblem } from '../../../core/http';

/** Format d'un export patient : `md` dans l'API, affiché « Markdown » (fiche 19, écarts). */
export type PatientExportFormat = 'pdf' | 'md';

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed';

/** Un patient proposé par le sélecteur de la page (fiche 19 : archivés listés en gris). */
export interface PatientOption {
  id: string;
  displayName: string;
  birthDate: string | null;
  archived: boolean;
}

/** ExportStatusDto en modèle de vue : champs absents → valeurs neutres. */
export interface ExportStatus {
  jobId: string;
  status: ExportJobStatus;
  requestedAt: string | null;
  finishedAt: string | null;
  /** Échéance du lien (7 jours après la fin) ; null tant que le job n'est pas terminé. */
  expiresAt: string | null;
  /** URL relative signée du zip ; null si le job n'est pas fini ou si le lien a expiré. */
  downloadUrl: string | null;
  error: string | null;
}

/** Un fichier reçu en pièce jointe, prêt à être enregistré par la page. */
export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/** Patients proposés par recherche : actifs puis archivés, chacun borné à cette taille. */
export const PATIENT_OPTIONS_LIMIT = 20;

/** Base factice pour lire les paramètres d'une URL relative du contrat. */
const RELATIVE_BASE = 'http://relative.invalid';

const ACCEPT: Record<PatientExportFormat, 'application/pdf' | 'text/markdown'> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
};

/**
 * Service de données de « Données et export » (fiche 19, G Q18) : export d'un patient à la volée,
 * export du compte en job asynchrone, liste des patients du sélecteur. Les fichiers passent par le
 * client généré en blob (aucune URL écrite à la main, et un 410 ou un 403 reste un ApiProblem que
 * l'écran affiche) ; les erreurs arrivent déjà en ApiProblem (core/http).
 */
@Injectable({ providedIn: 'root' })
export class DataExportApi {
  private readonly patients = inject(PatientsService);
  private readonly patientExports = inject(ExportPatientService);
  private readonly accountExports = inject(ExportDeCompteService);

  /**
   * GET /api/patients?q= (actifs) et ?q=&archived=true (archivés), en parallèle : les patients du
   * praticien dont le nom affiché contient `query`, actifs d'abord, triés par nom.
   */
  async searchPatients(query: string): Promise<PatientOption[]> {
    const q = query.trim() || undefined;
    const [active, archived] = await Promise.all([
      firstValueFrom(
        this.patients.listPatients(q, false, undefined, 'name', undefined, PATIENT_OPTIONS_LIMIT),
      ),
      firstValueFrom(
        this.patients.listPatients(q, true, undefined, 'name', undefined, PATIENT_OPTIONS_LIMIT),
      ),
    ]);
    return [...(active.items ?? []), ...(archived.items ?? [])].map(toOption);
  }

  /**
   * GET /api/patients/{id}/export?format=pdf|md → fichier en pièce jointe (export-nom-AAAAMMJJ).
   * Erreurs en ApiProblem (corps blob : seul le statut est lisible) : 403, 404, 429, 500.
   */
  async exportPatient(id: string, format: PatientExportFormat): Promise<DownloadedFile> {
    const response = await firstValueFrom(
      this.patientExports.exportPatient(id, format, 'response', false, {
        httpHeaderAccept: ACCEPT[format],
      }),
    );
    return {
      blob: response.body ?? new Blob(),
      fileName: fileNameOf(response.headers.get('Content-Disposition')) ?? `export.${format}`,
    };
  }

  /**
   * POST /api/me/export avec la session praticien (corps ignoré) → 202 { jobId, statusUrl }.
   * 409 EXPORT_IN_PROGRESS si un job est déjà en file ou en cours.
   */
  async requestExport(): Promise<string> {
    const response = (await firstValueFrom(
      this.accountExports.requestAccountExport({}),
    )) as ExportRequestedDto;
    if (!response.jobId) {
      // 202 sans jobId (otpRequired n'existe pas avec une session) : réponse inattendue.
      const problem: ApiProblem = { status: 202, code: 'EXPORT_JOB_MISSING' };
      throw problem;
    }
    return response.jobId;
  }

  /** GET /api/me/export/{jobId} (propriétaire connecté : pas de jeton) ; 404 EXPORT_NOT_FOUND. */
  async exportStatus(jobId: string): Promise<ExportStatus> {
    const dto = await firstValueFrom(this.accountExports.getAccountExport(jobId));
    return {
      jobId: dto.jobId ?? jobId,
      status: (dto.status as ExportJobStatus | undefined) ?? 'queued',
      requestedAt: dto.requestedAt ?? null,
      finishedAt: dto.finishedAt ?? null,
      expiresAt: dto.expiresAt ?? null,
      downloadUrl: dto.downloadUrl ?? null,
      error: dto.error ?? null,
    };
  }

  /**
   * GET /api/me/export/{jobId}/file?exp=&sig= : les paramètres signés de la downloadUrl renvoyée par
   * le serveur, passés au client généré. 410 EXPORT_EXPIRED et 403 SIGNED_URL_INVALID en ApiProblem.
   */
  async downloadExport(jobId: string, downloadUrl: string): Promise<DownloadedFile> {
    const params = new URL(downloadUrl, RELATIVE_BASE).searchParams;
    const response = await firstValueFrom(
      this.accountExports.downloadAccountExport(
        jobId,
        params.get('exp') ?? undefined,
        params.get('sig') ?? undefined,
        'response',
      ),
    );
    return {
      blob: response.body ?? new Blob(),
      fileName: fileNameOf(response.headers.get('Content-Disposition')) ?? 'export-psymate.zip',
    };
  }
}

function toOption(dto: PatientDto): PatientOption {
  return {
    id: dto.id ?? '',
    displayName: dto.displayName ?? '',
    birthDate: dto.birthDate ?? null,
    archived: !!dto.archivedAt,
  };
}

/** `attachment; filename="export-marie-d-20261026.pdf"` → le nom ; null sans en-tête lisible. */
export function fileNameOf(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8) return decodeURIComponent(utf8[1].trim());
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : null;
}
