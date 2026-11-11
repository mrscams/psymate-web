import { Page } from '@playwright/test';

/** Cible interactive mesurée sous 24 px (WCAG 2.5.8). */
export interface SmallTarget {
  text: string;
  tag: string;
  width: number;
  height: number;
}

/**
 * Cibles interactives visibles de moins de 24 × 24 px sur la page courante (UX-A3, WCAG 2.5.8 AA),
 * même règle que la sonde `tapTargets.tooSmall` de l'audit UX du 9 novembre 2026 :
 * - liens, boutons, champs, `[role=button|link|tab|switch|checkbox|radio]`, `[tabindex]` ≥ 0 ;
 * - exemptés : les liens dans une phrase (lien en ligne dont le parent porte aussi du texte
 *   propre), les éléments invisibles ou hors écran (lien d'évitement replié) ;
 * - une case ou un bouton radio natif placé dans un `<label>` englobant compte pour la taille du
 *   label, qui est cliquable (2.5.8 mesure la zone qui active le contrôle).
 * Mesure en pixels CSS arrondis au centième (getBoundingClientRect, marge intérieure comprise).
 */
export async function smallTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Hors du document (lien d'évitement replié au-dessus de la page).
      return rect.bottom + window.scrollY > 0 && rect.right + window.scrollX > 0;
    };

    // Lien dans une phrase : élément en ligne dont le parent a du texte propre non vide.
    const inSentence = (el: Element): boolean => {
      if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      return [...parent.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      );
    };

    // Les contrôles Material (champ natif invisible sous la case dessinée) sont mesurés par leur
    // conteneur : ils sont exclus ici, leur zone tactile Material fait 40 à 48 px.
    const materialNative = (el: Element): boolean =>
      el.matches('[class*="mdc-"][class*="native-control"], .mat-mdc-input-element');

    const out: { text: string; tag: string; width: number; height: number }[] = [];
    const seen = new Set<Element>();
    for (const candidate of document.querySelectorAll(selector)) {
      if (materialNative(candidate) || !visible(candidate) || inSentence(candidate)) continue;
      let target: Element = candidate;
      if (candidate.matches('input[type="checkbox"], input[type="radio"]')) {
        const label = candidate.closest('label');
        if (label) target = label;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      const rect = target.getBoundingClientRect();
      const width = Math.round(rect.width * 100) / 100;
      const height = Math.round(rect.height * 100) / 100;
      if (width < 24 || height < 24) {
        out.push({
          text: (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          tag: target.tagName.toLowerCase(),
          width,
          height,
        });
      }
    }
    return out;
  });
}

/**
 * Neutralise `.pm-link-target` (marges remises à 0) : sert à vérifier que la classe agrandit la
 * cible sans déplacer un seul pixel du rendu.
 */
export async function withoutLinkTargets(page: Page): Promise<() => Promise<void>> {
  const handle = await page.addStyleTag({
    content: '.pm-link-target { padding-block: 0 !important; margin-block: 0 !important; }',
  });
  return async () => {
    await handle.evaluate((node) => node.remove());
  };
}
