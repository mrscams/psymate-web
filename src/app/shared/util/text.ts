/** Initiales d'un nom affiché pour un avatar : « Claire Moreau » → « CM », « Marie D. » → « MD ». */
export function initials(displayName: string, max = 2): string {
  const parts = displayName
    .split(/[\s-]+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  return parts
    .slice(0, max)
    .map((part) => part[0].toLocaleUpperCase())
    .join('');
}

let counter = 0;

/** Identifiant unique pour relier un libellé, une description ou une boîte de dialogue (aria-*). */
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
