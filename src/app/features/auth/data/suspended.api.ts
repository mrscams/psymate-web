import { HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ExportDeCompteService, ExportRequestedDto, RecoursService } from '../../../api';
import { SKIP_AUTH_REDIRECT } from '../../../core/http';

/** Identifiants d'un compte refusé ou suspendu, qui n'a pas de session (fiche 27, contrat). */
export interface SuspendedCredentials {
  email: string;
  password: string;
  /** Code TOTP ou code de secours, seulement après un 202 otpRequired. */
  otp?: string;
}

export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed';

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

/** 202 de POST /api/me/export : job créé (avec son jeton de suivi), ou code 2FA demandé. */
export type ExportRequestOutcome =
  { kind: 'requested'; jobId: string; token: string | null } | { kind: 'otp-required' };

/** 201 de POST /api/me/appeal : recours ouvert ; 202 : code 2FA demandé, rien n'est enregistré. */
export type AppealOutcome =
  { kind: 'submitted'; id: string; submittedAt: string } | { kind: 'otp-required' };

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/** Nom de fichier par défaut si Content-Disposition manque (contrat : export-psymate-AAAAMMJJ.zip). */
const DEFAULT_FILE_NAME = 'export-psymate.zip';

/** Base factice pour lire les paramètres d'une URL relative du contrat. */
const RELATIVE_BASE = 'http://relative.invalid';

/**
 * Service de données du compte suspendu ou refusé (fiche 27) : export du compte (G Q18) et recours
 * (G Q28), sans session : les 401 INVALID_CREDENTIALS sont des messages de l'écran, pas une session
 * expirée, d'où SKIP_AUTH_REDIRECT sur chaque appel.
 */
@Injectable({ providedIn: 'root' })
export class SuspendedApi {
  private readonly exports = inject(ExportDeCompteService);
  private readonly appeals = inject(RecoursService);
  private readonly context = new HttpContext().set(SKIP_AUTH_REDIRECT, true);

  /**
   * POST /api/me/export { email, password, otp? } → 202 { jobId, statusUrl } ou { otpRequired }.
   * Erreurs en ApiProblem : 401, 403 EMAIL_NOT_CONFIRMED, 409 EXPORT_IN_PROGRESS |
   * ACCOUNT_NOT_SUSPENDED, 422, 423.
   */
  async requestExport(credentials: SuspendedCredentials): Promise<ExportRequestOutcome> {
    const body = {
      email: credentials.email,
      password: credentials.password,
      ...(credentials.otp ? { otp: credentials.otp } : {}),
    };
    const response = await firstValueFrom(
      this.exports.requestAccountExport(body, 'body', false, { context: this.context }),
    );
    if ('otpRequired' in response && response.otpRequired) return { kind: 'otp-required' };
    const requested = response as ExportRequestedDto;
    return {
      kind: 'requested',
      jobId: requested.jobId ?? '',
      token: tokenOf(requested.statusUrl),
    };
  }

  /** GET /api/me/export/{jobId}?token= → statut ; 404 EXPORT_NOT_FOUND (job inconnu ou jeton faux). */
  async exportStatus(jobId: string, token: string | null): Promise<ExportStatus> {
    const dto = await firstValueFrom(
      this.exports.getAccountExport(jobId, token ?? undefined, 'body', false, {
        context: this.context,
      }),
    );
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
   * GET /api/me/export/{jobId}/file?exp=&sig= (la downloadUrl signée) → zip en pièce jointe.
   * 410 EXPORT_EXPIRED (échéance passée ou fichier purgé) et 403 SIGNED_URL_INVALID en ApiProblem.
   */
  async downloadExport(jobId: string, downloadUrl: string): Promise<DownloadedFile> {
    const params = new URL(downloadUrl, RELATIVE_BASE).searchParams;
    const response = await firstValueFrom(
      this.exports.downloadAccountExport(
        jobId,
        params.get('exp') ?? undefined,
        params.get('sig') ?? undefined,
        'response',
        false,
        { context: this.context },
      ),
    );
    return {
      blob: response.body ?? new Blob(),
      fileName: fileNameOf(response.headers.get('Content-Disposition')) ?? DEFAULT_FILE_NAME,
    };
  }

  /**
   * POST /api/me/appeal { email, password, otp?, message } → 201 recours ouvert, 202 otpRequired.
   * Erreurs en ApiProblem : 401, 403 EMAIL_NOT_CONFIRMED, 409 ACCOUNT_NOT_SUSPENDED |
   * APPEAL_NOT_ALLOWED | APPEAL_ALREADY_OPEN | APPEAL_ALREADY_USED, 422 (REQUIRED, TOO_SHORT,
   * TOO_LONG), 423.
   */
  async submitAppeal(credentials: SuspendedCredentials, message: string): Promise<AppealOutcome> {
    const body = {
      email: credentials.email,
      password: credentials.password,
      message,
      ...(credentials.otp ? { otp: credentials.otp } : {}),
    };
    const response = await firstValueFrom(
      this.appeals.submitAppeal(body, 'response', false, { context: this.context }),
    );
    if (response.status === 202) return { kind: 'otp-required' };
    return {
      kind: 'submitted',
      id: response.body?.id ?? '',
      submittedAt: response.body?.submittedAt ?? new Date().toISOString(),
    };
  }
}

/** Jeton de suivi porté par le statusUrl (`/api/me/export/{jobId}?token=…`). */
export function tokenOf(statusUrl: string | undefined): string | null {
  if (!statusUrl) return null;
  return new URL(statusUrl, RELATIVE_BASE).searchParams.get('token');
}

/** `attachment; filename="export-psymate-20261107.zip"` → le nom ; null sans en-tête lisible. */
export function fileNameOf(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8) return decodeURIComponent(utf8[1].trim());
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : null;
}
