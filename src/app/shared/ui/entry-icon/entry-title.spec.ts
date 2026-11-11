import { clearTranslations, loadTranslations } from '@angular/localize';

import { ENTRY_TYPES, EntryType, entryTypeLabel } from './entry-icon.component';
import { ENTRY_TITLE_EXCERPT, entryTitle } from './entry-title';

const NOW = new Date('2026-11-11T10:00:00Z');
const OCT_24 = '2026-10-24T14:30:00Z';
const opts = { now: NOW, timeZone: 'UTC' };

/** Cibles anglaises de messages.en.xlf pour les messages de la fonction (le build en les charge). */
const EN = {
  'entry.type.note': 'Note',
  'entry.type.event': 'Event',
  'entry.type.situation': 'Situation',
  'entry.type.feeling': 'Feeling',
  'entry.type.session': 'Session',
  'entry.type.medication': 'Medication',
  'entry.title.typeDate': '{$label} · {$date}',
  'entry.title.feeling': '{$emotion} {$intensity}/10',
};

const FR_TYPES: Record<EntryType, string> = {
  note: 'Note',
  event: 'Événement',
  situation: 'Situation',
  feeling: 'Ressenti',
  session: 'Séance',
  medication: 'Médicament',
};

const LONG =
  'Dispute avec sa sœur au téléphone dimanche soir, elle raccroche sans prévenir et ne rappelle pas';

describe.each([
  { locale: 'fr', translate: false },
  { locale: 'en', translate: true },
])('entryTitle ($locale)', ({ locale, translate }) => {
  beforeEach(() => {
    if (translate) loadTranslations(EN);
  });
  afterEach(() => clearTranslations());

  const fr = locale === 'fr';

  it('le titre, s’il existe, replié sur une ligne', () => {
    expect(
      entryTitle({ type: 'note', title: '  Dispute\n avec\tsa sœur ', text: 'x' }, locale),
    ).toBe('Dispute avec sa sœur');
  });

  it('titre blanc : on passe au texte', () => {
    expect(entryTitle({ type: 'note', title: ' \n ', text: 'Appel du médecin' }, locale)).toBe(
      'Appel du médecin',
    );
  });

  it('texte court : entier, espaces et retours à la ligne repliés, sans « … »', () => {
    expect(entryTitle({ type: 'event', text: '\n  Appel   du\r\nmédecin  \n' }, locale)).toBe(
      'Appel du médecin',
    );
    const exact = 'a'.repeat(ENTRY_TITLE_EXCERPT);
    expect(entryTitle({ type: 'note', text: exact }, locale)).toBe(exact);
  });

  it('texte long : 60 caractères au plus, coupé au mot, avec « … »', () => {
    const title = entryTitle({ type: 'note', text: LONG }, locale);
    expect(title).toBe('Dispute avec sa sœur au téléphone dimanche soir, elle…');
    expect(title.length - 1).toBeLessThanOrEqual(ENTRY_TITLE_EXCERPT);
  });

  it('coupe exactement sur une espace : le mot entier est gardé', () => {
    const text = `${'a'.repeat(30)} ${'b'.repeat(29)} suite`;
    expect(entryTitle({ type: 'note', text }, locale)).toBe(`${'a'.repeat(30)} ${'b'.repeat(29)}…`);
  });

  it('ponctuation pendante retirée avant « … »', () => {
    const text = `${'a'.repeat(50)}, ${'b'.repeat(20)}`;
    expect(entryTitle({ type: 'note', text }, locale)).toBe(`${'a'.repeat(50)}…`);
  });

  it('un seul mot plus long que 60 caractères : coupé net', () => {
    expect(entryTitle({ type: 'note', text: 'x'.repeat(80) }, locale)).toBe(`${'x'.repeat(60)}…`);
  });

  it('les emoji comptent pour un caractère, jamais coupés en deux', () => {
    const title = entryTitle({ type: 'note', text: '😀'.repeat(70) }, locale);
    expect(Array.from(title)).toHaveLength(61);
    expect(title).toBe(`${'😀'.repeat(60)}…`);
  });

  describe.each([
    { segmenter: 'Intl.Segmenter', stub: false },
    { segmenter: 'repli sans Intl.Segmenter', stub: true },
  ])('graphèmes à cheval sur la 60e position ($segmenter)', ({ stub }) => {
    const intl = Intl as { Segmenter?: unknown };
    const saved = intl.Segmenter;
    beforeEach(() => {
      if (stub) intl.Segmenter = undefined;
    });
    afterEach(() => {
      intl.Segmenter = saved;
    });

    it.each([
      { name: 'emoji famille (joint U+200D)', lead: 'a', unit: '👨‍👩‍👧' },
      { name: 'drapeau (paire d’indicateurs régionaux)', lead: 'a', unit: '🇫🇷' },
      { name: 'teinte de peau', lead: '', unit: '👍🏽' },
      { name: 'accent décomposé (e + U+0301)', lead: 'x', unit: 'é' },
    ])('$name : 60 graphèmes entiers puis « … »', ({ lead, unit }) => {
      const text = lead + unit.repeat(70);
      const kept = 60 - (lead ? 1 : 0);
      const title = entryTitle({ type: 'note', text }, locale);
      expect(title).toBe(`${lead}${unit.repeat(kept)}…`);
      expect(title).not.toMatch(/‍…$/u);
    });

    it('accent décomposé sous la limite : texte entier, accents gardés', () => {
      const text = `x${'é'.repeat(40)}`;
      expect(entryTitle({ type: 'note', text }, locale)).toBe(text);
    });
  });

  it('ni titre ni texte : type et date courte de l’année en cours', () => {
    expect(
      entryTitle({ type: 'note', title: null, text: '  ', occurred: OCT_24 }, locale, opts),
    ).toBe(fr ? 'Note · 24 oct.' : 'Note · Oct 24');
  });

  it.each(ENTRY_TYPES)('%s : le libellé traduit du type', (type) => {
    const label = fr ? FR_TYPES[type] : EN[`entry.type.${type}`];
    expect(entryTypeLabel(type)).toBe(label);
    expect(entryTitle({ type, occurred: OCT_24 }, locale, opts)).toBe(
      `${label} · ${fr ? '24 oct.' : 'Oct 24'}`,
    );
  });

  it('libellés traduits : ressenti, séance', () => {
    expect(entryTitle({ type: 'feeling', occurred: OCT_24 }, locale, opts)).toBe(
      fr ? 'Ressenti · 24 oct.' : 'Feeling · Oct 24',
    );
    expect(entryTitle({ type: 'session', occurred: OCT_24 }, locale, opts)).toBe(
      fr ? 'Séance · 24 oct.' : 'Session · Oct 24',
    );
  });

  it('autre année : la date porte l’année', () => {
    expect(entryTitle({ type: 'situation', occurred: '2025-03-05T00:00:00Z' }, locale, opts)).toBe(
      fr ? 'Situation · 5 mars 2025' : 'Situation · Mar 5, 2025',
    );
  });

  it('date lue dans le fuseau donné', () => {
    const lateUtc = '2026-10-24T23:30:00Z';
    expect(entryTitle({ type: 'note', occurred: lateUtc }, locale, opts)).toBe(
      fr ? 'Note · 24 oct.' : 'Note · Oct 24',
    );
    expect(
      entryTitle({ type: 'note', occurred: lateUtc }, locale, {
        ...opts,
        timeZone: 'Europe/Paris',
      }),
    ).toBe(fr ? 'Note · 25 oct.' : 'Note · Oct 25');
  });

  it('accepte une Date', () => {
    expect(entryTitle({ type: 'note', occurred: new Date(OCT_24) }, locale, opts)).toBe(
      fr ? 'Note · 24 oct.' : 'Note · Oct 24',
    );
  });

  it('sans date, ou date invalide : le libellé seul', () => {
    expect(entryTitle({ type: 'event' }, locale, opts)).toBe(fr ? 'Événement' : 'Event');
    expect(entryTitle({ type: 'event', occurred: null }, locale, opts)).toBe(
      fr ? 'Événement' : 'Event',
    );
    expect(entryTitle({ type: 'event', occurred: 'n/a' }, locale, opts)).toBe(
      fr ? 'Événement' : 'Event',
    );
  });

  it('ressenti avec émotion : « Anxiété 6/10 · 24 oct. »', () => {
    expect(
      entryTitle(
        { type: 'feeling', emotion: 'Anxiété', intensity: 6, occurred: OCT_24 },
        locale,
        opts,
      ),
    ).toBe(fr ? 'Anxiété 6/10 · 24 oct.' : 'Anxiété 6/10 · Oct 24');
  });

  it('ressenti avec émotion sans intensité : l’émotion seule', () => {
    expect(entryTitle({ type: 'feeling', emotion: 'Joie', intensity: null }, locale, opts)).toBe(
      'Joie',
    );
  });

  it('émotion blanche ou type autre que ressenti : le libellé du type', () => {
    expect(entryTitle({ type: 'feeling', emotion: '  ', intensity: 6 }, locale, opts)).toBe(
      fr ? 'Ressenti' : 'Feeling',
    );
    expect(entryTitle({ type: 'note', emotion: 'Anxiété', intensity: 6 }, locale, opts)).toBe(
      'Note',
    );
  });

  it('le texte passe avant l’émotion d’un ressenti', () => {
    expect(
      entryTitle(
        { type: 'feeling', emotion: 'Anxiété', intensity: 6, text: 'Boule au ventre' },
        locale,
      ),
    ).toBe('Boule au ventre');
  });
});

describe('entryTitle : année par défaut', () => {
  it('sans `now`, l’année en cours n’est pas écrite', () => {
    const today = new Date();
    const title = entryTitle({ type: 'note', occurred: today }, 'fr');
    expect(title.startsWith('Note · ')).toBe(true);
    expect(title).not.toContain(String(today.getFullYear()));
  });
});
