// Surface de core/preferences (fiche 00 « Emplacement et stores », fiche 14, handbook §7).
export { LocaleNavigator } from './locale-navigator';
export { PREFERENCES_CACHE_KEY, PreferencesCache } from './preferences.cache';
export type {
  BookingModality,
  BookingWindow,
  PreferenceKey,
  Preferences,
} from './preferences.model';
export {
  BOOKING_HORIZON_DAYS_MAX,
  BOOKING_HORIZON_DAYS_MIN,
  BOOKING_MIN_NOTICE_HOURS_MAX,
  BOOKING_MIN_NOTICE_HOURS_MIN,
  BOOKING_MODALITIES,
  BOOKING_SLOT_DURATION_MAX,
  BOOKING_SLOT_DURATION_MIN,
  BOOKING_WINDOWS_MAX,
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
