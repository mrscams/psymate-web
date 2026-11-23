import {
  BOOKING_MINUTE_STEP,
  completePreferences,
  defaultPreferences,
  isValidPreference,
  PREFERENCE_KEYS,
} from './preferences.model';

/** Préférences booking.* (contrat 0.15.0, G Q64 ; bornes et défauts : G Q75 de l'API). */
describe('preferences.model · clés booking.*', () => {
  const defaults = defaultPreferences(null);

  it('les huit clés sont lues par le client, avec les défauts du contrat', () => {
    expect(PREFERENCE_KEYS.filter((key) => key.startsWith('booking.'))).toEqual([
      'booking.enabled',
      'booking.confirmation',
      'booking.windows',
      'booking.slotDurationMin',
      'booking.minNoticeHours',
      'booking.horizonDays',
      'booking.modalities',
      'booking.timezone',
    ]);
    expect(PREFERENCE_KEYS).toHaveLength(20);
    expect(defaults['booking.enabled']).toBe(false);
    expect(defaults['booking.confirmation']).toBe('manual');
    expect(defaults['booking.windows']).toEqual([]);
    expect(defaults['booking.slotDurationMin']).toBe(60);
    expect(defaults['booking.minNoticeHours']).toBe(24);
    expect(defaults['booking.horizonDays']).toBe(28);
    expect(defaults['booking.modalities']).toEqual(['in_person']);
    expect(defaults['booking.timezone']).toBe('Europe/Paris');
  });

  it('des préférences lues sans aucune clé booking.* prennent les huit défauts', () => {
    const read = completePreferences({ theme: 'dark', 'agenda.dayStartHour': 9 });
    expect(read.theme).toBe('dark');
    for (const key of PREFERENCE_KEYS.filter((k) => k.startsWith('booking.'))) {
      expect(read[key]).toEqual(defaults[key]);
    }
  });

  it('des valeurs valides des huit clés sont gardées telles quelles', () => {
    const valid = {
      'booking.enabled': true,
      'booking.confirmation': 'auto',
      'booking.windows': [
        { day: 1, start: '09:00', end: '12:00' },
        { day: 1, start: '12:00', end: '14:00' },
        { day: 7, start: '00:00', end: '23:55' },
      ],
      'booking.slotDurationMin': 45,
      'booking.minNoticeHours': 168,
      'booking.horizonDays': 90,
      'booking.modalities': ['video', 'phone', 'in_person'],
      'booking.timezone': 'America/Montreal',
    };
    expect(completePreferences(valid)).toMatchObject(valid);
  });

  it('booking.enabled : autre chose qu’un booléen → false', () => {
    expect(isValidPreference('booking.enabled', true)).toBe(true);
    expect(completePreferences({ 'booking.enabled': 'true' })['booking.enabled']).toBe(false);
    expect(completePreferences({ 'booking.enabled': 1 })['booking.enabled']).toBe(false);
  });

  it('booking.confirmation : mode inconnu → manual', () => {
    expect(isValidPreference('booking.confirmation', 'auto')).toBe(true);
    expect(completePreferences({ 'booking.confirmation': 'instant' })['booking.confirmation']).toBe(
      'manual',
    );
  });

  it.each([
    ['pas une liste', { day: 1, start: '09:00', end: '12:00' }],
    ['jour 0', [{ day: 0, start: '09:00', end: '12:00' }]],
    ['jour 8', [{ day: 8, start: '09:00', end: '12:00' }]],
    ['jour non entier', [{ day: 1.5, start: '09:00', end: '12:00' }]],
    ['minutes non multiples de 5', [{ day: 1, start: '09:03', end: '12:00' }]],
    ['heure hors format', [{ day: 1, start: '9:00', end: '12:00' }]],
    ['24:00', [{ day: 1, start: '09:00', end: '24:00' }]],
    ['fin avant début', [{ day: 1, start: '12:00', end: '09:00' }]],
    ['fin égale au début', [{ day: 1, start: '09:00', end: '09:00' }]],
    ['champ manquant', [{ day: 1, start: '09:00' }]],
    ['champ inconnu', [{ day: 1, start: '09:00', end: '12:00', label: 'matin' }]],
    ['plage qui n’est pas un objet', ['lundi 9h-12h']],
    [
      'chevauchement le même jour',
      [
        { day: 2, start: '09:00', end: '12:00' },
        { day: 2, start: '11:00', end: '13:00' },
      ],
    ],
    [
      'chevauchement non trié',
      [
        { day: 2, start: '11:00', end: '13:00' },
        { day: 3, start: '09:00', end: '10:00' },
        { day: 2, start: '09:00', end: '12:00' },
      ],
    ],
    [
      'plus de 21 plages',
      Array.from({ length: 22 }, (_, i) => ({
        day: (i % 7) + 1,
        start: `0${Math.floor(i / 7)}:00`,
        end: `0${Math.floor(i / 7)}:30`,
      })),
    ],
  ])('booking.windows : %s → liste vide (défaut)', (_, windows) => {
    expect(completePreferences({ 'booking.windows': windows })['booking.windows']).toEqual([]);
  });

  it('booking.windows : contiguës et 21 plages admises ; mêmes heures sur deux jours admises', () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => ({
      day: (i % 7) + 1,
      start: `0${Math.floor(i / 7)}:00`,
      end: `0${Math.floor(i / 7)}:30`,
    }));
    expect(isValidPreference('booking.windows', twentyOne)).toBe(true);
    expect(
      isValidPreference('booking.windows', [
        { day: 1, start: '09:00', end: '12:00' },
        { day: 2, start: '09:00', end: '12:00' },
      ]),
    ).toBe(true);
    expect(isValidPreference('booking.windows', [])).toBe(true);
  });

  it.each([14, 181, 62, 60.5, '60'])('booking.slotDurationMin : %s → 60', (value) => {
    expect(
      completePreferences({ 'booking.slotDurationMin': value })['booking.slotDurationMin'],
    ).toBe(60);
  });

  it('pas de 5 minutes : durée d’un créneau et minutes des plages', () => {
    expect(BOOKING_MINUTE_STEP).toBe(5);
    expect(isValidPreference('booking.slotDurationMin', 15 + BOOKING_MINUTE_STEP)).toBe(true);
    expect(isValidPreference('booking.slotDurationMin', 15 + BOOKING_MINUTE_STEP - 1)).toBe(false);
    expect(isValidPreference('booking.windows', [{ day: 1, start: '09:55', end: '23:55' }])).toBe(
      true,
    );
    expect(isValidPreference('booking.windows', [{ day: 1, start: '09:00', end: '23:59' }])).toBe(
      false,
    );
  });

  it('booking.slotDurationMin : 15 et 180 admis', () => {
    expect(isValidPreference('booking.slotDurationMin', 15)).toBe(true);
    expect(isValidPreference('booking.slotDurationMin', 180)).toBe(true);
  });

  it.each([0, 169, 2.5, '24'])('booking.minNoticeHours : %s → 24', (value) => {
    expect(completePreferences({ 'booking.minNoticeHours': value })['booking.minNoticeHours']).toBe(
      24,
    );
  });

  it.each([6, 91, 7.5, null])('booking.horizonDays : %s → 28', (value) => {
    expect(completePreferences({ 'booking.horizonDays': value })['booking.horizonDays']).toBe(28);
  });

  it('booking.minNoticeHours et booking.horizonDays : bornes admises', () => {
    expect(isValidPreference('booking.minNoticeHours', 1)).toBe(true);
    expect(isValidPreference('booking.minNoticeHours', 168)).toBe(true);
    expect(isValidPreference('booking.horizonDays', 7)).toBe(true);
    expect(isValidPreference('booking.horizonDays', 90)).toBe(true);
  });

  it.each([[[]], [['in_person', 'in_person']], [['in_person', 'email']], ['video'], [{}]])(
    'booking.modalities : %j → ["in_person"]',
    (value) => {
      expect(completePreferences({ 'booking.modalities': value })['booking.modalities']).toEqual([
        'in_person',
      ]);
    },
  );

  it.each(['Paris', '+02:00', 'UTC+1', '', 'Mars/Olympus', 42])(
    'booking.timezone : %j → Europe/Paris',
    (value) => {
      expect(completePreferences({ 'booking.timezone': value })['booking.timezone']).toBe(
        'Europe/Paris',
      );
    },
  );

  it('booking.timezone : noms IANA admis', () => {
    expect(isValidPreference('booking.timezone', 'UTC')).toBe(true);
    expect(isValidPreference('booking.timezone', 'America/Argentina/Buenos_Aires')).toBe(true);
  });

  it('une clé invalide ne touche pas les autres clés booking.*', () => {
    const read = completePreferences({
      'booking.enabled': true,
      'booking.windows': [{ day: 9, start: '09:00', end: '12:00' }],
      'booking.horizonDays': 14,
    });
    expect(read['booking.enabled']).toBe(true);
    expect(read['booking.windows']).toEqual([]);
    expect(read['booking.horizonDays']).toBe(14);
  });
});

/** Langue du compte (M16-25, contrat 0.16.0) : fr, en ou ar ; aucun écran ne propose ar (Q80). */
describe('preferences.model · locale', () => {
  it('admet fr, en et ar ; une valeur ar lue est gardée telle quelle', () => {
    expect(isValidPreference('locale', 'fr')).toBe(true);
    expect(isValidPreference('locale', 'en')).toBe(true);
    expect(isValidPreference('locale', 'ar')).toBe(true);
    expect(completePreferences({ locale: 'ar' }).locale).toBe('ar');
    expect(completePreferences({ locale: 'en' }).locale).toBe('en');
    expect(completePreferences({ locale: 'fr' }).locale).toBe('fr');
  });

  it('refuse toute autre langue (défaut fr)', () => {
    for (const value of ['de', 'AR', 'ar-MA', '', null, 3]) {
      expect(isValidPreference('locale', value)).toBe(false);
      expect(completePreferences({ locale: value }).locale).toBe('fr');
    }
  });
});
