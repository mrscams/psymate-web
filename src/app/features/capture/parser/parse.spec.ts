// Grammaire de la barre de commande (M6-01) : table de phrases (parse.cases.ts) et cas ciblés.
import type { EntryType } from '../../../shared/ui';
import type { OccurredPrecision } from '../../../shared/util';
import { matchEmotion } from './emotion-match';
import { CAPTURE_PREFIXES, parse } from './parse';
import { CASE_EMOTIONS, CASE_OPTIONS, caseOptions, PARSE_CASES } from './parse.cases';
import type { CaptureEntryType, CapturePrecision } from './parse.types';
import { BLOCKING_WARNINGS, INTENSITY_MAX, INTENSITY_MIN, PARSE_HINTS } from './parse.types';

// Contrôle à la compilation : les unions locales restent des sous-ensembles des valeurs du contrat
// déjà employées par l'application (EntryType, OccurredPrecision).
const typeIsContractValue: (type: CaptureEntryType) => EntryType = (type) => type;
const precisionIsContractValue: (precision: CapturePrecision) => OccurredPrecision = (p) => p;

describe('parse — table de phrases', () => {
  it('couvre au moins 40 phrases', () => {
    expect(PARSE_CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PARSE_CASES.map((parseCase) => parseCase.rule)).size).toBe(PARSE_CASES.length);
  });

  for (const parseCase of PARSE_CASES) {
    it(`${parseCase.rule} : « ${parseCase.input} »`, () => {
      const result = parse(parseCase.input, caseOptions(parseCase));
      expect(result).toEqual(parseCase.expected);
      expect(typeIsContractValue(result.type)).toBe(result.type);
      expect(precisionIsContractValue(result.occurred.precision)).toBe(result.occurred.precision);
    });
  }
});

describe('parse — pureté', () => {
  it('ne dépend pas du fuseau de la machine', () => {
    const host = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
    if (!host) return;
    const saved = host.env['TZ'];
    // Fuseau effectif avant le test : retirer TZ ne remet pas Node sur le fuseau du système (il
    // garderait America/Adak pour les fichiers suivants du même worker), on le repose donc.
    const original = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const run = (): unknown[] =>
      PARSE_CASES.map((parseCase) => parse(parseCase.input, caseOptions(parseCase)));
    try {
      host.env['TZ'] = 'Pacific/Kiritimati';
      const east = run();
      host.env['TZ'] = 'America/Adak';
      const west = run();
      expect(east).toEqual(west);
      expect(east).toEqual(PARSE_CASES.map((parseCase) => parseCase.expected));
    } finally {
      host.env['TZ'] = saved ?? original;
    }
  });

  it('ne modifie ni la saisie ni les options', () => {
    const options = { ...CASE_OPTIONS, emotions: [...CASE_EMOTIONS] };
    const before = JSON.stringify(options);
    parse("anx 8 n'a pas dormi hier > entretien", options);
    expect(JSON.stringify(options)).toBe(before);
    expect(options.now.toISOString()).toBe('2026-11-11T09:30:00.000Z');
  });

  it('rend le même résultat à chaque appel', () => {
    const input = '/sit surcharge depuis mars > entretien';
    expect(parse(input, CASE_OPTIONS)).toEqual(parse(input, CASE_OPTIONS));
  });
});

describe('parse — cas ciblés', () => {
  const at = (input: string, overrides: Partial<typeof CASE_OPTIONS> = {}) =>
    parse(input, { ...CASE_OPTIONS, ...overrides });

  it('expose les préfixes, les bornes et un code d’aide par avertissement', () => {
    expect(CAPTURE_PREFIXES.map((entry) => entry.prefix)).toEqual([
      '/evt',
      '/sit',
      '/med',
      '/note',
    ]);
    expect([INTENSITY_MIN, INTENSITY_MAX]).toEqual([0, 10]);
    expect(Object.keys(PARSE_HINTS)).toHaveLength(12);
  });

  it('« / » seul est un préfixe inconnu', () => {
    const result = at('/ test');
    expect(result.type).toBe('note');
    expect(result.warnings).toEqual([
      {
        code: 'UNKNOWN_PREFIX',
        hint: 'USE_KNOWN_PREFIX',
        blocking: false,
        params: { prefix: '/', known: ['/evt', '/sit', '/med', '/note'] },
      },
    ]);
  });

  it('formes longues des préfixes', () => {
    expect(at('/situation x').type).toBe('situation');
    expect(at('/médicament x').type).toBe('medication');
    expect(at('/event x').type).toBe('event');
  });

  it('un mot sans lettre suivi d’un nombre reste une note', () => {
    expect(at('3 8 fois').type).toBe('note');
  });

  it('un préfixe d’émotion trop court n’est pas lu', () => {
    const result = at('an 5');
    expect(result.emotionCode).toBeUndefined();
    expect(result.warnings[0]).toMatchObject({ code: 'UNKNOWN_EMOTION', params: { word: 'an' } });
    expect(at('an dormi').type).toBe('note');
  });

  it('un mot court égal à un libellé est reconnu', () => {
    const result = at('ok 3', { emotions: [{ code: 'c_00000001', labelFr: 'Ok' }] });
    expect(result.emotionCode).toBe('c_00000001');
  });

  it('libellés exacts en double → ambiguïté', () => {
    const result = at('las 3', {
      emotions: [
        { code: 'c_00000001', labelFr: 'Las' },
        { code: 'c_00000002', labelFr: 'LAS' },
      ],
    });
    expect(result.emotionCode).toBeUndefined();
    expect(result.warnings[0]).toMatchObject({
      code: 'AMBIGUOUS_EMOTION',
      params: { candidates: ['c_00000001', 'c_00000002'] },
    });
  });

  it('vocabulaire vide : note, ou création proposée devant une intensité', () => {
    expect(at('anx 8', { emotions: [] }).warnings[0].code).toBe('UNKNOWN_EMOTION');
    expect(at('anx dormi', { emotions: [] }).type).toBe('note');
  });

  it('libellé anglais d’une émotion', () => {
    const emotions = [{ code: 'c_00000003', labelFr: 'Lassitude', labelEn: 'Weariness' }];
    expect(at('wear 2', { emotions }).emotionCode).toBe('c_00000003');
  });

  it('guillemets typographiques anglais', () => {
    const result = at('/note “hier” et “demain');
    expect(result.text).toBe('“hier” et “demain');
    expect(result.warnings).toEqual([
      {
        code: 'UNCLOSED_QUOTE',
        hint: 'CLOSE_QUOTE',
        blocking: true,
        params: { quote: '“', index: 16 },
      },
    ]);
  });

  it('un mot retiré entre deux passages cités laisse un espace', () => {
    expect(at('/note «x»hier«y»').text).toBe('«x» «y»');
    expect(at('/note «x»hier«y»').occurred.from).toBe('2026-11-10T00:00:00Z');
  });

  it('cible entre guillemets vides', () => {
    expect(at('/note a > «»').warnings).toEqual([
      { code: 'EMPTY_TARGET', hint: 'TYPE_TARGET_AFTER_GT', blocking: false, params: {} },
    ]);
  });

  it('cible collée au texte', () => {
    expect(at('/note dormi>entretien')).toMatchObject({
      text: 'dormi',
      target: { query: 'entretien' },
    });
  });

  it('dates non reconnues : amorces, unités et années', () => {
    expect(at('/note il y a longtemps').occurred.precision).toBe('exact');
    expect(at('/note depuis longtemps').occurred.precision).toBe('exact');
    expect(at('/note il y a 3x').occurred.precision).toBe('exact');
    expect(at('/note 3 jours plus tard').occurred.precision).toBe('exact');
    expect(at('/note 2019 seul').occurred.precision).toBe('exact');
    expect(at('/note printemps doux').occurred.precision).toBe('exact');
    expect(at('/note 12 apôtres').occurred.precision).toBe('exact');
    expect(at('/note 3 days later', { locale: 'en' }).occurred.precision).toBe('exact');
    expect(at('/note in the morning', { locale: 'en' }).occurred.precision).toBe('exact');
  });

  it('dates impossibles', () => {
    expect(at('/note 31/04/2024').warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
    expect(at('/note 2024-13-01').warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
    expect(at('/note 0 mars 2024').warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
    expect(at('/note le 31 avril').warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
  });

  it('29 février d’une année bissextile', () => {
    expect(at('/note 29 février 2024').occurred.from).toBe('2024-02-29T00:00:00Z');
  });

  it('durées en mois et années qui changent d’année', () => {
    expect(at('/note il y a 11 mois').occurred.from).toBe('2025-12-01T00:00:00Z');
    expect(at('/note il y a 23 mois').occurred.from).toBe('2024-12-01T00:00:00Z');
  });

  it('saison en cours dans le futur', () => {
    expect(at('/note hiver 2027').warnings[0]).toMatchObject({ code: 'FUTURE_DATE' });
    expect(at('/note hiver 2026').occurred).toEqual({
      from: '2025-12-01T00:00:00Z',
      precision: 'period',
      to: '2026-03-01T00:00:00Z',
      label: 'hiver 2026',
    });
  });

  it('jour de semaine anglais du jour même', () => {
    expect(at('/note wednesday', { locale: 'en' }).occurred.from).toBe('2026-11-04T00:00:00Z');
  });

  it('JJ/MM avec amorce dans l’année en cours', () => {
    expect(at('/note le 1/2').occurred.from).toBe('2026-02-01T00:00:00Z');
  });

  it('horloge invalide : erreur de programmation', () => {
    expect(() => at('/note hier', { now: new Date('invalide') })).toThrow(RangeError);
  });

  it('avertissements bloquants et informatifs', () => {
    expect([...BLOCKING_WARNINGS].sort()).toEqual([
      'AMBIGUOUS_EMOTION',
      'EMPTY_TEXT',
      'INTENSITY_OUT_OF_RANGE',
      'UNCLOSED_QUOTE',
      'UNKNOWN_EMOTION',
    ]);
    const all = PARSE_CASES.flatMap((parseCase) => parseCase.expected.warnings);
    for (const warning of all) {
      expect(warning.blocking).toBe(BLOCKING_WARNINGS.includes(warning.code));
    }
    expect(at('stress 7').warnings[0].blocking).toBe(true);
    expect(at('anx dormi').warnings[0].blocking).toBe(false);
  });

  it('occurred est exactement un EntryOccurredRequest', () => {
    const keys = PARSE_CASES.map((parseCase) =>
      Object.keys(parse(parseCase.input, caseOptions(parseCase)).occurred),
    );
    for (const list of keys) {
      for (const key of list) expect(['from', 'precision', 'to', 'label'].includes(key)).toBe(true);
    }
  });

  it('dates hors bornes : jamais d’instant illisible', () => {
    for (const input of [
      '/note il y a 99999999999999 jours',
      '/note il y a 99999999999999 h',
      '/note il y a 99999999999999 mois',
      '/note hiver 1900',
    ]) {
      const result = at(input);
      expect(result.occurred.precision).toBe('exact');
      expect(result.warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
    }
  });

  it('jour suivant ou prochain le jour même : dans 7 jours', () => {
    expect(at('/note mercredi prochain').occurred.from).toBe('2026-11-18T00:00:00Z');
    expect(at('/note lundi suivant').occurred.from).toBe('2026-11-16T00:00:00Z');
    expect(at('/note next wednesday', { locale: 'en' }).occurred.from).toBe('2026-11-18T00:00:00Z');
    expect(at('/note next week', { locale: 'en' }).occurred.precision).toBe('exact');
  });

  it('habitudes en anglais : pas de date', () => {
    expect(at('/note every monday', { locale: 'en' }).dateExpression).toBeUndefined();
  });

  it('jour de semaine et date avec année qui concordent', () => {
    expect(at('/note mardi 10 novembre 2026').dateExpression).toBe('mardi 10 novembre 2026');
    expect(at('/note mardi 31 avril').warnings[0]).toMatchObject({ code: 'INVALID_DATE' });
  });

  it('anglais : mois avant le jour, avec année', () => {
    expect(at('/note march 3 2024', { locale: 'en' }).occurred.from).toBe('2024-03-03T00:00:00Z');
  });

  it('préfixe ambigu et nombre hors bornes : note', () => {
    expect(at('tri 12').type).toBe('note');
    expect(at('tri 12').warnings[0].code).toBe('POSSIBLE_FEELING');
  });

  it('émotion suivie d’un nombre avec unité : note', () => {
    expect(at('anx 8 jours').type).toBe('note');
    expect(at('anx 8').type).toBe('feeling');
  });

  it('mot vide anglais suivi d’un nombre : note', () => {
    expect(at('the 5', { locale: 'en' }).type).toBe('note');
  });

  it('cible numérique : la cible précédente n’est pas reprise', () => {
    expect(at('/note a > b > 14/9')).toMatchObject({ text: 'a > b > 14/9' });
    expect(at('/note a > b > 14/9').target).toBeUndefined();
  });

  it('aucun mot : aucune émotion', () => {
    expect(matchEmotion([], CASE_EMOTIONS)).toEqual({ kind: 'none' });
  });

  it('langue de grammaire : sous-étiquette primaire', () => {
    expect(at('/note yesterday', { locale: 'en_US' }).dateExpression).toBe('yesterday');
    expect(at('/note yesterday', { locale: 'eng' }).dateExpression).toBe('yesterday');
    expect(at('/note hier', { locale: 'enfr' }).dateExpression).toBe('hier');
    expect(at('/note hier', { locale: '' }).dateExpression).toBe('hier');
  });
});
