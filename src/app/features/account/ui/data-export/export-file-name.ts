import { PatientExportFormat } from '../../data/data-export.api';

/**
 * Nom du fichier qu'enverra GET /api/patients/{id}/export (fiche 19 : `export-nom-AAAAMMJJ.pdf`),
 * affiché à côté d'« Exporter » (UX-C6). Même règle que le serveur : nom en minuscules sans accents,
 * tirets entre les mots, 40 caractères au plus, « patient » à défaut ; date du jour en UTC. Le nom
 * réel reste celui de la réponse (Content-Disposition) : ce texte n'est qu'une annonce.
 */
export function expectedExportFileName(
  displayName: string,
  format: PatientExportFormat,
  now: Date = new Date(),
): string {
  let slug = displayName
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > 40) slug = slug.slice(0, 40).replace(/-+$/, '');
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `export-${slug || 'patient'}-${day}.${format}`;
}
