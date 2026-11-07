import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { completePreferences, Preferences } from './preferences.model';

/** Clé de localStorage (fiche 14 : « cache de démarrage uniquement »). */
export const PREFERENCES_CACHE_KEY = 'prefs';

/**
 * Cache local des préférences : lu une seule fois au démarrage pour appliquer le thème et le
 * vocabulaire avant la réponse du serveur, écrit après chaque réponse, effacé à la déconnexion.
 * Jamais une source de vérité : un contenu absent, illisible ou corrompu est ignoré.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesCache {
  private readonly storage = storageOf(inject(DOCUMENT));

  /** Les préférences du cache complétées par les défauts, ou null s'il n'y a rien d'exploitable. */
  read(): Preferences | null {
    try {
      const text = this.storage?.getItem(PREFERENCES_CACHE_KEY);
      if (!text) return null;
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      return completePreferences(parsed);
    } catch {
      return null;
    }
  }

  write(preferences: Preferences): void {
    try {
      this.storage?.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
    } catch {
      // Stockage plein ou interdit : le cache est un confort, pas une nécessité.
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(PREFERENCES_CACHE_KEY);
    } catch {
      // Idem.
    }
  }
}

function storageOf(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    // Accès refusé (cookies bloqués) : pas de cache.
    return null;
  }
}
