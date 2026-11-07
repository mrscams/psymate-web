// Surface de core/preferences (fiche 00 « Emplacement et stores », fiche 14, handbook §7).
export { LocaleNavigator } from './locale-navigator';
export { PREFERENCES_CACHE_KEY, PreferencesCache } from './preferences.cache';
export type { PreferenceKey, Preferences } from './preferences.model';
export {
  completePreferences,
  defaultPreferences,
  isValidPreference,
  PREFERENCE_KEYS,
  SESSION_DURATION_MAX,
  SESSION_DURATION_MIN,
} from './preferences.model';
export { providePreferences } from './preferences.provider';
export type { PreferencesSource, PreferencesStatus } from './preferences.store';
export { PreferencesStore } from './preferences.store';
