import { ExportedFile } from '../data/patient-export.api';

/**
 * Enregistre un fichier reçu en blob : lien temporaire `download` cliqué puis retiré. Le fichier
 * passe par HttpClient (et non par une navigation) pour que ses erreurs (403, 404, 429, 500)
 * restent des ApiProblem affichés sous le menu « Exporter ce dossier ».
 */
export function saveFile(document: Document, file: ExportedFile): void {
  const view = document.defaultView;
  if (!view) return;
  const url = view.URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Laisser au navigateur le temps de lire le blob avant de libérer l'URL.
  view.setTimeout(() => view.URL.revokeObjectURL(url), 1_000);
}
