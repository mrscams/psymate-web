import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Clé `theme` des préférences (fiche 14) : clair, contraste doux, sombre, ou la préférence système. */
export type ThemePreference = 'light' | 'soft' | 'dark' | 'system';

/** Valeur posée dans data-theme : les trois blocs de src/theme/tokens.css. */
export type ResolvedTheme = 'light' | 'soft' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'soft', 'dark', 'system'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applique le thème sur <html data-theme> (étude couleurs §6, §8) : instantané, sans rechargement,
 * puisque Material et les composants lisent des variables CSS. `system` suit prefers-color-scheme
 * et change avec lui. La préférence elle-même appartient au PreferencesStore (M1-16) qui appelle
 * set() ; ici, aucune persistance.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.(DARK_QUERY) ?? null;
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** Le réglage du praticien ; `system` par défaut (étude §6, « Bascule »). */
  readonly preference = signal<ThemePreference>('system');

  /** Le thème effectivement affiché. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference === 'system') return this.systemDark() ? 'dark' : 'light';
    return preference;
  });

  constructor() {
    const onChange = (event: MediaQueryListEvent): void => this.systemDark.set(event.matches);
    this.media?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));
    this.apply(this.resolved());
  }

  set(preference: ThemePreference): void {
    if (!THEME_PREFERENCES.includes(preference)) return;
    this.preference.set(preference);
    this.apply(this.resolved());
  }

  /** Relit la préférence système (après un changement) et réapplique. */
  refresh(): void {
    if (this.media) this.systemDark.set(this.media.matches);
    this.apply(this.resolved());
  }

  private apply(theme: ResolvedTheme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }
}
