// Reconnaissance de l'émotion en tête de saisie (B5 : « anx » → anxiété, préfixe suffisant, émotions
// personnalisées incluses). Comparaison sur le code et les deux libellés, sans casse ni accents.
//
// Règles, dans l'ordre :
// 1. Correspondance exacte, du plus long libellé au plus court : les premiers mots égalent un code ou
//    un libellé (« tristesse profonde » avant « tristesse »). Une seule émotion → reconnue.
// 2. Sinon, préfixe du premier mot (3 lettres au moins, pour ne pas lire « a » ou « en » comme une
//    émotion) : une seule émotion dont un code ou un libellé commence par ce mot → reconnue.
// 3. Plusieurs émotions à l'étape 1 ou 2 → ambiguë (candidats = codes). Aucune → rien.

import { foldLabel } from './normalize';
import type { EmotionOption } from './parse.types';

/** Longueur minimale d'un préfixe d'émotion (« anx »). */
export const MIN_EMOTION_PREFIX = 3;

export type EmotionMatch =
  | { readonly kind: 'match'; readonly code: string; readonly words: number }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }
  | { readonly kind: 'none' };

interface EmotionKeys {
  readonly code: string;
  readonly keys: readonly string[];
}

function emotionKeys(emotions: readonly EmotionOption[]): EmotionKeys[] {
  return emotions.map((emotion) => ({
    code: emotion.code,
    keys: [emotion.code, emotion.labelFr, emotion.labelEn ?? '']
      .map(foldLabel)
      .filter((key) => key !== ''),
  }));
}

function decide(codes: readonly string[], words: number): EmotionMatch {
  const unique = [...new Set(codes)];
  if (unique.length === 1) return { kind: 'match', code: unique[0], words };
  return unique.length > 1 ? { kind: 'ambiguous', candidates: unique } : { kind: 'none' };
}

/**
 * @param words les premiers mots de la saisie, déjà normalisés (foldWord), dans l'ordre.
 */
export function matchEmotion(
  words: readonly string[],
  emotions: readonly EmotionOption[],
): EmotionMatch {
  if (words.length === 0) return { kind: 'none' };
  const all = emotionKeys(emotions);
  const longest = Math.max(1, ...all.flatMap((emotion) => emotion.keys.map(wordCount)));
  for (let count = Math.min(longest, words.length); count >= 1; count--) {
    const phrase = words.slice(0, count).join(' ');
    const exact = all.filter((emotion) => emotion.keys.includes(phrase));
    const result = decide(
      exact.map((emotion) => emotion.code),
      count,
    );
    if (result.kind !== 'none') return result;
  }
  const prefix = words[0];
  if (prefix.length < MIN_EMOTION_PREFIX) return { kind: 'none' };
  const starts = all.filter((emotion) => emotion.keys.some((key) => key.startsWith(prefix)));
  return decide(
    starts.map((emotion) => emotion.code),
    1,
  );
}

function wordCount(key: string): number {
  return key.split(' ').length;
}
