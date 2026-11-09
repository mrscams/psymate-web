import { ShortcutDescriptor, ShortcutRegistration } from '../../../core/shortcuts';

/** Une ligne de l'aide des raccourcis (planche 29 §6) : touches, effet, disponible ici ou non. */
export interface HelpRow {
  /** Touches telles qu'on les affiche, chacune dans un <kbd> (« Ctrl », « Entrée »). */
  keys: string[];
  /** Ce que fait la touche : la description de l'écran courant si elle existe, sinon la générale. */
  label: string;
  /** false : la touche n'a pas d'objet sur l'écran courant (grisée, « indisponible ici »). */
  available: boolean;
  /** Touches à presser ensemble (« Ctrl + Entrée ») ; sinon touches alternatives (« 1 2 3 »). */
  combo?: boolean;
}

/** Touches qui agissent partout, quelle que soit l'inscription courante (Échap ferme ce panneau). */
const ALWAYS_AVAILABLE = new Set(['?', 'Escape']);

/** 1 2 3 : une seule ligne, comme la planche (« Vue d'ensemble · Timeline · Graphe »). */
const TAB_KEYS = ['1', '2', '3'];

/**
 * Lignes de l'aide, alimentées par le registre (core/shortcuts) :
 * - la liste de référence `globalShortcuts()` (N, /, L, 1 2 3, M, Échap, ?), dans son ordre ; chaque
 *   touche prend la description de son inscription active si elle en a une (« Filtrer mes
 *   patients » sur la liste), sinon le libellé général, et est grisée si aucune inscription ne
 *   l'utilise ici ;
 * - les gestes de formulaire décrits par les features (`extra` : Entrée, Ctrl+Entrée, Ctrl+S), qui
 *   ne passent pas par le registre (ils ont un modificateur ou agissent dans un champ) ;
 * - les autres inscriptions actives qui portent une description (+, -, F de la timeline).
 * Fonction pure : l'aide en prend une photo à l'ouverture.
 */
export function helpRows(
  global: readonly ShortcutDescriptor[],
  active: readonly ShortcutRegistration[],
  extra: readonly HelpRow[] = [],
): HelpRow[] {
  const byKey = new Map(active.map((registration) => [registration.key, registration]));
  const known = new Set(global.map((descriptor) => descriptor.key));
  const rows: HelpRow[] = [];

  const tabs = global.filter((descriptor) => TAB_KEYS.includes(descriptor.key));
  for (const descriptor of global) {
    if (TAB_KEYS.includes(descriptor.key)) {
      if (descriptor.key !== tabs[0]?.key) continue;
      rows.push({
        keys: tabs.map((tab) => tab.display),
        label: tabs.map((tab) => byKey.get(tab.key)?.description || tab.label).join(' · '),
        available: tabs.some((tab) => byKey.has(tab.key)),
      });
      continue;
    }
    const registration = byKey.get(descriptor.key);
    rows.push({
      keys: [descriptor.display],
      label: registration?.description || descriptor.label,
      available: ALWAYS_AVAILABLE.has(descriptor.key) || !!registration,
    });
  }

  // Le ? reste en dernier : les gestes de formulaire se lisent avec les touches simples.
  const help = rows.findIndex((row) => row.keys.length === 1 && row.keys[0] === '?');
  const tail = help >= 0 ? rows.splice(help, 1) : [];

  const local = active
    .filter((registration) => !known.has(registration.key) && !!registration.description)
    .map<HelpRow>((registration) => ({
      keys: [displayKey(registration.key)],
      label: registration.description ?? '',
      available: true,
    }));

  return [...rows, ...extra, ...local, ...tail];
}

/** Touche d'une inscription hors liste de référence : lettre en capitale, sinon telle quelle. */
export function displayKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}
