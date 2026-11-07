/** Côté de la photo envoyée (fiche 10 : carré, 512 px au plus ; le serveur réduit aussi). */
export const PHOTO_SIZE = 512;

/** Qualité JPEG de la photo recadrée. */
export const PHOTO_QUALITY = 0.9;

/** Formats acceptés par le serveur (signature vérifiée côté API). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;

/**
 * Réglage du recadrage : `zoom` ≥ 1 (1 = le plus grand carré possible), `x` et `y` entre 0 et 1
 * (0 = bord gauche ou haut, 0,5 = centre, 1 = bord droit ou bas).
 */
export interface CropView {
  zoom: number;
  x: number;
  y: number;
}

export const CENTERED: CropView = { zoom: 1, x: 0.5, y: 0.5 };

/** Carré source dans l'image d'origine (pixels). */
export interface SourceSquare {
  sx: number;
  sy: number;
  side: number;
}

/** Le carré à découper dans une image `width` × `height` pour un réglage donné. */
export function cropSquare(width: number, height: number, view: CropView): SourceSquare {
  const zoom = Math.max(1, view.zoom);
  const side = Math.min(width, height) / zoom;
  return {
    sx: (width - side) * clamp01(view.x),
    sy: (height - side) * clamp01(view.y),
    side,
  };
}

/** Côté du JPEG produit : 512 px, ou moins si le carré source est plus petit (jamais d'agrandissement). */
export function outputSide(sourceSide: number): number {
  return Math.max(1, Math.min(PHOTO_SIZE, Math.round(sourceSide)));
}

/** Image décodée, quel que soit son type (ImageBitmap en navigateur, image factice en test). */
export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

/**
 * Décode le fichier choisi en appliquant l'orientation EXIF (le recadrage se fait sur l'image telle
 * qu'on la voit). Rejette si le navigateur ne sait pas lire le fichier.
 */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  };
}

/** Dessine le carré choisi sur un canvas `side` × `side` (aperçu ou export). */
export function drawCrop(
  canvas: HTMLCanvasElement,
  image: DecodedImage,
  view: CropView,
  side: number,
): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;
  canvas.width = side;
  canvas.height = side;
  const square = cropSquare(image.width, image.height, view);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, square.sx, square.sy, square.side, square.side, 0, 0, side, side);
  return true;
}

/**
 * Recadre en carré et réencode en JPEG par un canvas natif (aucune bibliothèque) : la photo
 * produite ne garde aucune métadonnée (EXIF, GPS) et pèse quelques dizaines de ko, même pour une
 * photo d'origine de 8 Mo (le serveur refuse au-delà de 5 Mo).
 */
export async function cropToJpeg(image: DecodedImage, view: CropView): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const side = outputSide(cropSquare(image.width, image.height, view).side);
  if (!drawCrop(canvas, image, view, side)) throw new Error('canvas 2d indisponible');
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encodage JPEG impossible'))),
      'image/jpeg',
      PHOTO_QUALITY,
    );
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}
