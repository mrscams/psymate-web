import { toPage } from './search.api';
import {
  decodeEntities,
  effectiveQuery,
  elideSnippet,
  EMPTY_FILTERS,
  filtersFromParams,
  filtersToParams,
  isoDay,
  parseMarked,
  plainText,
  presetFrom,
  presetOf,
  sameFilters,
  toRequest,
} from './search.model';

describe('search.model', () => {
  it.each([
    ['', ''],
    ['e', ''],
    [' en ', 'en'],
    ['entretien   manger', 'entretien manger'],
    ['tag:travail', 'tag:travail'],
  ])('effectiveQuery(%j) = %j (2 caractères au moins)', (input, expected) => {
    expect(effectiveQuery(input)).toBe(expected);
  });

  it('effectiveQuery coupe à 200 caractères (400 TOO_LONG évité)', () => {
    expect(effectiveQuery('a'.repeat(250))).toHaveLength(200);
  });

  describe('parseMarked', () => {
    it('découpe les <mark> en morceaux surlignés et décode les entités', () => {
      expect(parseMarked('L&#39;<mark>entretien</mark> &amp; le <mark>manager</mark>')).toEqual([
        { text: "L'", mark: false },
        { text: 'entretien', mark: true },
        { text: ' & le ', mark: false },
        { text: 'manager', mark: true },
      ]);
    });

    it('sans injection : une balise échappée reste du texte, une balise brute aussi', () => {
      const segments = parseMarked('&lt;script&gt;alert(1)&lt;/script&gt; <img src=x onerror=1>');
      expect(segments).toEqual([
        { text: '<script>alert(1)</script> <img src=x onerror=1>', mark: false },
      ]);
    });

    it('null, vide → null ; plainText recolle le texte', () => {
      expect(parseMarked(null)).toBeNull();
      expect(parseMarked('')).toBeNull();
      expect(plainText(parseMarked('a <mark>b</mark> c'))).toBe('a b c');
    });

    it('decodeEntities : numériques, hexadécimales, nommées, inconnues laissées telles quelles', () => {
      expect(decodeEntities('&#233;&#xE9;&quot;&nbsp;&foo;')).toBe('éé" &foo;');
    });
  });

  describe('URL', () => {
    it('lit les paramètres et ignore les valeurs mal formées', () => {
      expect(
        filtersFromParams({
          q: 'tag:travail',
          types: 'feeling',
          from: '2026-06-01',
          to: 'demain',
          session: 'pas-un-uuid',
          archived: 'true',
        }),
      ).toEqual({
        q: 'tag:travail',
        type: 'feeling',
        from: '2026-06-01',
        to: null,
        sessionId: null,
        archived: true,
      });
      expect(filtersFromParams({ types: 'rêve' }).type).toBeNull();
    });

    it('écrit les paramètres (null retire le paramètre)', () => {
      expect(filtersToParams({ ...EMPTY_FILTERS, q: 'manager', type: 'note' })).toEqual({
        q: 'manager',
        types: 'note',
        from: null,
        to: null,
        session: null,
        archived: null,
      });
    });

    it('toRequest : type exclusif en tableau, page, texte effectif ; la syntaxe part telle quelle', () => {
      expect(
        toRequest({ ...EMPTY_FILTERS, q: ' émotion:anxiété  avant:2026-09 ', type: 'feeling' }, 2),
      ).toEqual({
        q: 'émotion:anxiété avant:2026-09',
        types: ['feeling'],
        from: null,
        to: null,
        sessionId: null,
        includeArchived: false,
        page: 2,
      });
    });

    it('sameFilters compare le texte effectif', () => {
      expect(sameFilters({ ...EMPTY_FILTERS, q: 'm' }, { ...EMPTY_FILTERS, q: 'x' })).toBe(true);
      expect(sameFilters({ ...EMPTY_FILTERS, q: 'ma' }, { ...EMPTY_FILTERS, q: 'mar' })).toBe(
        false,
      );
    });
  });

  describe('période', () => {
    const today = new Date(2026, 10, 8);

    it('préréglages en jours locaux', () => {
      expect(isoDay(today)).toBe('2026-11-08');
      expect(presetFrom('30d', today)).toBe('2026-10-09');
      expect(presetFrom('90d', today)).toBe('2026-08-10');
      expect(presetFrom('12m', today)).toBe('2025-11-08');
      expect(presetFrom('all', today)).toBeNull();
    });

    it('presetOf reconnaît un préréglage, sinon custom', () => {
      expect(presetOf({ from: null, to: null }, today)).toBe('all');
      expect(presetOf({ from: '2026-08-10', to: null }, today)).toBe('90d');
      expect(presetOf({ from: '2026-01-01', to: null }, today)).toBe('custom');
      expect(presetOf({ from: null, to: '2026-01-01' }, today)).toBe('custom');
    });
  });

  it('toPage : exacts puis approchés séparés, compteurs pour les six types', () => {
    const dto = {
      total: 1,
      page: 1,
      pageSize: 20,
      tookMs: 12,
      exactCount: 1,
      approximateCount: 1,
      facets: { types: [{ code: 'event', count: 1 }] },
      items: [
        {
          entryId: 'a',
          type: 'event',
          title: '<mark>Entretien</mark>',
          approximate: false,
          tags: [],
        },
        { entryId: 'b', type: 'note', snippet: 'manager', approximate: true },
        { type: 'note' },
      ],
      query: { text: 'entretien manger', tags: [], emotions: [] },
    };
    const page = toPage(dto as unknown as Parameters<typeof toPage>[0]);
    expect(page.exact.map((h) => h.entryId)).toEqual(['a']);
    expect(page.approximate.map((h) => h.entryId)).toEqual(['b']);
    expect(page.counts).toHaveLength(6);
    expect(page.counts.find((c) => c.type === 'event')?.count).toBe(1);
    expect(page.counts.find((c) => c.type === 'feeling')?.count).toBe(0);
    expect(page.query.before).toBeNull();
  });

  describe('elideSnippet (séparateur de fragments seulement)', () => {
    const elided = (fragment: string) => plainText(elideSnippet(parseMarked(fragment)));

    it('note courte sans ponctuation finale (« RAS ») : intacte, aucun « … »', () => {
      expect(elided('RAS')).toBe('RAS');
      expect(elided('Bonne <mark>séance</mark>')).toBe('Bonne séance');
    });

    it('saisie entièrement en minuscules (« anxiété ») : intacte, aucun « … »', () => {
      expect(elideSnippet(parseMarked('<mark>anxiété</mark>'))).toEqual([
        { text: 'anxiété', mark: true },
      ]);
      expect(elided('rdv annulé')).toBe('rdv annulé');
    });

    it('extrait à deux fragments : « ... » → « … », mark conservé', () => {
      expect(
        elideSnippet(
          parseMarked('Annoncé en séance. ... Trois phrases pour l&#39;<mark>entretien</mark>'),
        ),
      ).toEqual([
        { text: "Annoncé en séance. … Trois phrases pour l'", mark: false },
        { text: 'entretien', mark: true },
      ]);
      expect(elideSnippet(null)).toBeNull();
    });
  });

  it('toPage : séparateur remplacé sur les extraits exacts avec texte seulement', () => {
    const items = [
      { entryId: 'a', type: 'note', snippet: 'un ... <mark>deux</mark>', approximate: false },
      { entryId: 'b', type: 'note', snippet: 'un ... deux', approximate: true },
    ];
    const withText = toPage({ items, query: { text: 'deux' } } as unknown as Parameters<
      typeof toPage
    >[0]);
    expect(plainText(withText.exact[0].snippet)).toBe('un … deux');
    expect(plainText(withText.approximate[0].snippet)).toBe('un ... deux');
    const noText = toPage({ items, query: { text: '' } } as unknown as Parameters<
      typeof toPage
    >[0]);
    expect(plainText(noText.exact[0].snippet)).toBe('un ... deux');
  });
});
