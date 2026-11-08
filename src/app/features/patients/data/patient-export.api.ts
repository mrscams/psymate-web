import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ExportPatientService } from '../../../api';

/** Format d'un export patient : `md` dans l'API, affiché « Markdown » (fiche 19, écarts). */
export type PatientExportFormat = 'pdf' | 'md';

/** Un fichier reçu en pièce jointe, prêt à être enregistré par le composant. */
export interface ExportedFile {
  blob: Blob;
  fileName: string;
}

const ACCEPT: Record<PatientExportFormat, 'application/pdf' | 'text/markdown'> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
};

/**
 * Export du dossier depuis la fiche patient (fiche 16, état C de la fiche 19) : un seul appel au
 * client généré, en blob, pour que les erreurs restent des ApiProblem affichés par l'écran.
 */
@Injectable({ providedIn: 'root' })
export class PatientExportApi {
  private readonly exports = inject(ExportPatientService);

  /**
   * GET /api/patients/{id}/export?format=pdf|md → fichier en pièce jointe (export-nom-AAAAMMJJ),
   * entrées privées et archivées exclues. Erreurs (corps blob : seul le statut est lisible) : 403,
   * 404, 429, 500.
   */
  async exportPatient(id: string, format: PatientExportFormat): Promise<ExportedFile> {
    const response = await firstValueFrom(
      this.exports.exportPatient(id, format, 'response', false, {
        httpHeaderAccept: ACCEPT[format],
      }),
    );
    return {
      blob: response.body ?? new Blob(),
      fileName: fileNameOf(response.headers.get('Content-Disposition')) ?? `export.${format}`,
    };
  }
}

/** `attachment; filename="export-marie-d-20261026.pdf"` → le nom ; null sans en-tête lisible. */
export function fileNameOf(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8) return decodeURIComponent(utf8[1].trim());
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : null;
}
