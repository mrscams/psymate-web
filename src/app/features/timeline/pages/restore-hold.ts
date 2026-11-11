/** Durée maximale pendant laquelle la position rangée est tenue au retour sur l'onglet. */
export const RESTORE_HOLD_MS = 3000;

/** Gestes sur la liste qui rendent la main au praticien. */
const LIST_GESTURES = ['wheel', 'pointerdown', 'touchstart', 'focusin'] as const;

/**
 * Position de défilement tenue au retour sur l'onglet (UX-B2) : une relecture des fenêtres, un
 * redimensionnement ou un viewport recréé ne la déplacent pas. Elle tombe au premier geste du
 * praticien (molette, pointeur ou toucher sur la liste, focus qui entre dans la liste, toute touche
 * du clavier, même pressée hors de la liste : Tab depuis la barre d'outils vers une carte hors
 * écran doit pouvoir faire défiler), et au plus tard après RESTORE_HOLD_MS.
 */
export class RestoreHold {
  private target: { offset: number; until: number } | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Tient la position `offset` (px) à partir de maintenant. */
  hold(offset: number): void {
    this.target = { offset, until: this.now() + RESTORE_HOLD_MS };
  }

  release(): void {
    this.target = null;
  }

  /** Position tenue, ou null (rien à tenir, geste du praticien, échéance passée). */
  get offset(): number | null {
    if (this.target && this.now() > this.target.until) this.target = null;
    return this.target?.offset ?? null;
  }

  /** Après un défilement à `top` : la position à remettre, ou null si le défilement est accepté. */
  correction(top: number): number | null {
    const offset = this.offset;
    return offset !== null && Math.abs(top - offset) > 1 ? offset : null;
  }

  /**
   * Écoute les gestes qui libèrent la position : sur la liste (`list`) et le clavier sur tout le
   * document. Renvoie la fonction qui retire les écouteurs.
   */
  listen(list: HTMLElement, doc: Document): () => void {
    const release = () => this.release();
    for (const name of LIST_GESTURES) list.addEventListener(name, release, { passive: true });
    doc.addEventListener('keydown', release, { capture: true, passive: true });
    return () => {
      for (const name of LIST_GESTURES) list.removeEventListener(name, release);
      doc.removeEventListener('keydown', release, { capture: true });
    };
  }
}
