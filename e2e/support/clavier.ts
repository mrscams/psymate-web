import { expect, Locator, Page } from '@playwright/test';

/**
 * Parcours au clavier seul (B7, C5 « navigation clavier complète », M7-04).
 *
 * `keyboardOnly(page)` est appelé avant la première navigation : il écoute, dans chaque document
 * chargé par la page, les gestes de pointeur réels (événements `isTrusted` : appui, déplacement,
 * molette, toucher) et les rapporte au test. `expectNoPointer()` échoue si un seul a eu lieu : un
 * parcours qui passe par un `click()`, un `hover()` ou `page.mouse` ne peut pas se dire « au
 * clavier ». Entrée ou Espace sur un bouton produisent un `click` sans pointeur : ils ne comptent pas.
 */
export interface KeyboardOnly {
  /** Aucun geste de pointeur depuis `keyboardOnly()`. */
  expectNoPointer(): void;
}

const POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'mousedown',
  'mouseup',
  'mousemove',
  'dblclick',
  'wheel',
  'touchstart',
] as const;

export async function keyboardOnly(page: Page): Promise<KeyboardOnly> {
  const gestures: string[] = [];
  await page.exposeBinding('pmPointerGesture', (_source, gesture: string) => {
    gestures.push(gesture);
  });
  await page.addInitScript((types: readonly string[]) => {
    const report = (event: Event): void => {
      if (!event.isTrusted) return;
      const target = event.target;
      const where =
        target instanceof Element
          ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}`
          : 'document';
      (window as unknown as { pmPointerGesture?: (g: string) => void }).pmPointerGesture?.(
        `${event.type} sur ${where}`,
      );
    };
    for (const type of types) window.addEventListener(type, report, { capture: true });
  }, POINTER_EVENTS);
  return {
    expectNoPointer(): void {
      expect(gestures, 'parcours au clavier : aucun geste de souris ni de toucher').toEqual([]);
    },
  };
}

/** Vrai si `target` (ou un de ses descendants) a le focus. */
async function holdsFocus(target: Locator): Promise<boolean> {
  if ((await target.count()) === 0) return false;
  return target
    .first()
    .evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
}

/**
 * Tab (ou Maj+Tab) jusqu'à ce que `target` ait le focus : prouve que l'élément est dans l'ordre de
 * tabulation. Échoue après `max` appuis. Renvoie le nombre d'appuis.
 */
export async function tabTo(
  page: Page,
  target: Locator,
  options: { max?: number; backwards?: boolean } = {},
): Promise<number> {
  const max = options.max ?? 60;
  const key = options.backwards ? 'Shift+Tab' : 'Tab';
  for (let presses = 0; presses <= max; presses++) {
    if (await holdsFocus(target)) return presses;
    await page.keyboard.press(key);
  }
  throw new Error(`le focus n'a pas atteint ${target.toString()} en ${max} appuis sur ${key}`);
}

/** Saisie au clavier dans l'élément qui a le focus (frappe réelle, pas `fill`). */
export async function typeInto(page: Page, field: Locator, text: string): Promise<void> {
  await expect(field).toBeFocused();
  await page.keyboard.type(text);
}

/** Le focus revient sur le document (aucun champ actif) : les raccourcis à une touche s'appliquent. */
export async function leaveField(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
