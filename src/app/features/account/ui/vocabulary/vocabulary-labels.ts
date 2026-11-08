import { Emotion, EmotionFamily } from '../../data/emotions.api';

/** Nom affiché d'une famille ; la couleur de la pastille est toujours doublée par ce nom. */
export function familyLabel(family: EmotionFamily): string {
  switch (family) {
    case 'joy':
      return $localize`:Famille d'émotions@@vocabulary.family.joy:Joie`;
    case 'trust':
      return $localize`:Famille d'émotions@@vocabulary.family.trust:Confiance`;
    case 'fear':
      return $localize`:Famille d'émotions@@vocabulary.family.fear:Peur`;
    case 'surprise':
      return $localize`:Famille d'émotions@@vocabulary.family.surprise:Surprise`;
    case 'sadness':
      return $localize`:Famille d'émotions@@vocabulary.family.sadness:Tristesse`;
    case 'disgust':
      return $localize`:Famille d'émotions@@vocabulary.family.disgust:Dégoût`;
    case 'anger':
      return $localize`:Famille d'émotions@@vocabulary.family.anger:Colère`;
    case 'anticipation':
      return $localize`:Famille d'émotions@@vocabulary.family.anticipation:Anticipation`;
  }
}

/** Couleur de la pastille : token --emotion-<famille> (src/theme/tokens.css). */
export function familyColor(family: EmotionFamily): string {
  return `var(--emotion-${family})`;
}

/** Forme de comparaison d'un libellé : minuscules, sans accents ni « # », espaces réduits. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similarité de Dice sur les trigrammes (0 à 1) de deux libellés normalisés. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): string[] => {
    const padded = `  ${s} `;
    const out: string[] = [];
    for (let i = 0; i < padded.length - 2; i++) out.push(padded.slice(i, i + 3));
    return out;
  };
  const left = grams(a);
  const right = new Map<string, number>();
  for (const gram of grams(b)) right.set(gram, (right.get(gram) ?? 0) + 1);
  let common = 0;
  for (const gram of left) {
    const count = right.get(gram) ?? 0;
    if (count > 0) {
      common++;
      right.set(gram, count - 1);
    }
  }
  const total = left.length + grams(b).length;
  return total === 0 ? 0 : (2 * common) / total;
}

/** Seuil de proximité (fiche 17 : 0,6 côté serveur ; ici une simple aide à la saisie). */
export const PROXIMITY_THRESHOLD = 0.6;

/**
 * Émotion proche d'un libellé en cours de saisie (fiche 17) : même libellé normalisé, libellé
 * existant contenu comme mot entier (« Appréhension sociale » → « Appréhension »), ou trigrammes
 * proches. Un avertissement seulement : le serveur juge l'égalité (409 EMOTION_LABEL_EXISTS).
 */
export function closestEmotion(label: string, emotions: readonly Emotion[]): Emotion | null {
  const wanted = normalizeLabel(label);
  if (wanted.length < 3) return null;
  let best: Emotion | null = null;
  let bestScore = 0;
  for (const emotion of emotions) {
    const other = normalizeLabel(emotion.labelFr);
    if (!other) continue;
    let score = trigramSimilarity(wanted, other);
    if (other === wanted) score = 2;
    else if (containsWord(wanted, other) || containsWord(other, wanted)) score = Math.max(score, 1);
    if (score > bestScore) {
      bestScore = score;
      best = emotion;
    }
  }
  return bestScore >= PROXIMITY_THRESHOLD ? best : null;
}

function containsWord(haystack: string, needle: string): boolean {
  if (needle.length < 4) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}
