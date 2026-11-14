import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Touches globales de B2 et de la fiche 00 ; une feature peut en enregistrer d'autres (F, +, -). */
export type GlobalShortcutKey = 'n' | '/' | 'l' | '1' | '2' | '3' | 'm' | 'ctrl+b' | 'Escape' | '?';

export interface ShortcutDescriptor {
  key: string;
  /** Touche telle qu'on l'affiche (« Échap », « ? », « Ctrl+B »). */
  display: string;
  /** Combinaison : les touches à presser ensemble, chacune affichée à part (« Ctrl », « B »). */
  combo?: string[];
  /** Ce que fait la touche, pour l'aide des raccourcis (planche 29 §6). */
  label: string;
}

export interface ShortcutRegistration {
  key: string;
  handler: (event: KeyboardEvent) => void;
  /** Permet d'afficher la touche dans l'aide avec ce qu'elle fait ici. */
  description?: string;
}

/** Liste de référence pour l'aide (`?`) ; les gestes eux-mêmes sont branchés par chaque feature. */
export function globalShortcuts(): ShortcutDescriptor[] {
  return [
    { key: 'n', display: 'N', label: $localize`:Aide des raccourcis@@shortcuts.n:Nouvelle entrée` },
    {
      key: '/',
      display: '/',
      label: $localize`:Aide des raccourcis@@shortcuts.search:Rechercher`,
    },
    {
      key: 'l',
      display: 'L',
      label: $localize`:Aide des raccourcis@@shortcuts.l:Lier l'entrée ouverte`,
    },
    { key: '1', display: '1', label: $localize`:Aide des raccourcis@@shortcuts.1:Vue d'ensemble` },
    { key: '2', display: '2', label: $localize`:Aide des raccourcis@@shortcuts.2:Timeline` },
    { key: '3', display: '3', label: $localize`:Aide des raccourcis@@shortcuts.3:Graphe` },
    { key: 'm', display: 'M', label: $localize`:Aide des raccourcis@@shortcuts.m:Changer de mode` },
    {
      key: 'ctrl+b',
      display: 'Ctrl+B',
      combo: ['Ctrl', 'B'],
      label: $localize`:Aide des raccourcis (rail de navigation, UX-S8)@@shortcuts.ctrlB:Ouvrir ou fermer la navigation`,
    },
    {
      key: 'Escape',
      display: $localize`:Nom de la touche Échap@@shortcuts.escapeKey:Échap`,
      label: $localize`:Aide des raccourcis@@shortcuts.escape:Fermer le panneau, le brouillon est conservé`,
    },
    {
      key: '?',
      display: '?',
      label: $localize`:Aide des raccourcis@@shortcuts.help:Afficher cette aide`,
    },
  ];
}

const EDITABLE_ROLES = new Set(['textbox', 'combobox', 'searchbox', 'spinbutton', 'slider']);

/** Un champ a le focus : les touches simples servent à écrire (fiche 00, core/shortcuts). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute('role');
  return role !== null && EDITABLE_ROLES.has(role);
}

/**
 * Registre des raccourcis globaux (fiche 00) : une feature enregistre une touche à l'entrée de son
 * écran et se désinscrit à la sortie ; la dernière inscription d'une touche l'emporte (un panneau
 * ouvert prend Échap), et la précédente la retrouve à sa désinscription. Inactif quand un champ a
 * le focus (sauf Échap) ou qu'un modificateur est enfoncé.
 *
 * Combinaisons avec Ctrl (UX-S8) : une inscription `ctrl+<touche>` répond à Ctrl, ou ⌘ sur Mac, plus
 * la touche, sans Alt ni Maj, y compris dans un champ (elle n'écrit rien) ; les touches simples
 * restent muettes dès qu'un modificateur est enfoncé.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutService {
  private readonly stacks = new Map<string, ShortcutRegistration[]>();
  private readonly version = signal(0);

  /** Suspend tous les raccourcis (ex. pendant une boîte de dialogue Material). */
  readonly enabled = signal(true);

  /** Inscriptions actives (la plus récente par touche), pour l'aide. */
  readonly active = computed(() => {
    this.version();
    return [...this.stacks.entries()]
      .map(([, stack]) => stack.at(-1))
      .filter((registration): registration is ShortcutRegistration => !!registration);
  });

  constructor() {
    const document = inject(DOCUMENT);
    const listener = (event: KeyboardEvent): void => this.handle(event);
    document.addEventListener('keydown', listener);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', listener));
  }

  /** Inscrit une touche ; renvoie la fonction qui la désinscrit. */
  register(key: string, handler: (event: KeyboardEvent) => void, description?: string): () => void {
    const normalized = normalize(key);
    const registration: ShortcutRegistration = { key: normalized, handler, description };
    const stack = this.stacks.get(normalized) ?? [];
    stack.push(registration);
    this.stacks.set(normalized, stack);
    this.version.update((v) => v + 1);
    return () => {
      const current = this.stacks.get(normalized) ?? [];
      const rest = current.filter((item) => item !== registration);
      if (rest.length > 0) this.stacks.set(normalized, rest);
      else this.stacks.delete(normalized);
      this.version.update((v) => v + 1);
    };
  }

  /** Traite un keydown : appelle la dernière inscription de la touche et empêche l'action par défaut. */
  handle(event: KeyboardEvent): void {
    if (!this.enabled() || event.defaultPrevented || event.repeat) return;
    if (event.altKey) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.shiftKey || event.key.length !== 1) return;
      this.dispatch(`ctrl+${event.key.toLowerCase()}`, event);
      return;
    }
    const key = normalize(event.key);
    if (key !== 'Escape' && isEditableTarget(event.target)) return;
    this.dispatch(key, event);
  }

  private dispatch(key: string, event: KeyboardEvent): void {
    const registration = this.stacks.get(key)?.at(-1);
    if (!registration) return;
    event.preventDefault();
    registration.handler(event);
  }
}

function normalize(key: string): string {
  if (key === 'Esc') return 'Escape';
  if (/^ctrl\+.$/i.test(key)) return key.toLowerCase();
  return key.length === 1 ? key.toLowerCase() : key;
}
