import { EntryType } from '../../../shared/ui';
import { CATALOG } from './link.fixtures';
import {
  entryName,
  LinkTypeCode,
  orient,
  otherEnd,
  plainText,
  toCreateBody,
  typeAvailability,
} from './link.model';

const allowedCodes = (from: EntryType | null, to: EntryType | null): LinkTypeCode[] =>
  typeAvailability(CATALOG, from, to)
    .filter((item) => item.allowed)
    .map((item) => item.type.code);

describe('typeAvailability : filtrage des types par la matrice E5.3', () => {
  // Table de cas écrite à la main depuis E5.3 (docs/E-modele-donnees.md), pas recalculée.
  it.each<[EntryType, EntryType, LinkTypeCode[]]>([
    ['event', 'feeling', ['triggers', 'worsens', 'relieves', 'co_occurs', 'follows']],
    ['feeling', 'event', ['caused_by', 'co_occurs', 'follows']],
    ['medication', 'feeling', ['worsens', 'relieves', 'co_occurs', 'treats']],
    ['feeling', 'medication', ['co_occurs']],
    ['medication', 'situation', ['worsens', 'relieves', 'co_occurs', 'treats']],
    ['note', 'situation', ['co_occurs', 'follows', 'part_of']],
    ['note', 'event', ['co_occurs', 'follows']],
    ['note', 'note', ['co_occurs', 'follows']],
    ['event', 'session', ['part_of']],
    ['session', 'feeling', ['triggers', 'relieves']],
    ['session', 'session', []],
    [
      'event',
      'situation',
      ['triggers', 'caused_by', 'worsens', 'relieves', 'co_occurs', 'follows', 'part_of'],
    ],
  ])('%s → %s : %j', (from, to, expected) => {
    expect(allowedCodes(from, to)).toEqual(expected);
  });

  it('cible inconnue : seule la source filtre', () => {
    expect(allowedCodes('feeling', null)).toEqual(['caused_by', 'co_occurs', 'follows', 'part_of']);
    expect(allowedCodes('medication', null)).toEqual([
      'worsens',
      'relieves',
      'co_occurs',
      'treats',
    ]);
  });

  it('sens inconnu des deux côtés : tout est permis', () => {
    expect(allowedCodes(null, null)).toHaveLength(8);
  });

  it('les huit types restent présents, dans l’ordre du catalogue (désactivés, pas masqués)', () => {
    const codes = typeAvailability(CATALOG, 'feeling', 'medication').map((item) => item.type.code);
    expect(codes).toEqual(CATALOG.map((type) => type.code));
  });

  it('raison du refus : source, cible, ou les deux ; « réversible » si l’autre sens est permis', () => {
    const treats = typeAvailability(CATALOG, 'feeling', 'situation').find(
      (item) => item.type.code === 'treats',
    );
    expect(treats?.reason).toEqual({ source: true, target: false, reversible: false });

    const triggers = typeAvailability(CATALOG, 'feeling', 'event').find(
      (item) => item.type.code === 'triggers',
    );
    expect(triggers?.reason).toEqual({ source: true, target: false, reversible: true });

    const partOf = typeAvailability(CATALOG, 'situation', 'event').find(
      (item) => item.type.code === 'part_of',
    );
    expect(partOf?.reason).toEqual({ source: true, target: true, reversible: true });

    const coOccurs = typeAvailability(CATALOG, 'session', 'feeling').find(
      (item) => item.type.code === 'co_occurs',
    );
    // Symétrique : jamais « possible en inversant ».
    expect(coOccurs?.reason?.reversible).toBe(false);
  });
});

describe('orient, toCreateBody : inversion du sens', () => {
  it('sans inversion l’entrée ouverte est la source ; inversée, la cible le devient', () => {
    expect(orient('ouverte', 'autre', false)).toEqual({ from: 'ouverte', to: 'autre' });
    expect(orient('ouverte', 'autre', true)).toEqual({ from: 'autre', to: 'ouverte' });
  });

  it('inversé → direction incoming, le type reste le code actif ; justification nettoyée', () => {
    expect(
      toCreateBody({ targetId: 't', linkType: 'triggers', reversed: true, rationale: '  ' }),
    ).toEqual({ targetId: 't', linkType: 'triggers', direction: 'incoming' });
    expect(
      toCreateBody({
        targetId: 't',
        linkType: 'worsens',
        reversed: false,
        rationale: ' parce que ',
      }),
    ).toEqual({
      targetId: 't',
      linkType: 'worsens',
      direction: 'outgoing',
      rationale: 'parce que',
    });
  });

  it('otherEnd : l’autre extrémité vue depuis l’entrée', () => {
    expect(otherEnd({ sourceId: 'a', targetId: 'b' }, 'a')).toBe('b');
    expect(otherEnd({ sourceId: 'a', targetId: 'b' }, 'b')).toBe('a');
  });
});

describe('entryName, plainText', () => {
  it('titre, sinon extrait de 60 caractères, sinon « une entrée »', () => {
    expect(entryName({ title: ' Anxiété ', excerpt: 'x' }, 'une entrée')).toBe('Anxiété');
    expect(entryName({ title: null, excerpt: 'court' }, 'une entrée')).toBe('court');
    const long = 'a'.repeat(80);
    expect(entryName({ title: null, excerpt: long }, 'une entrée')).toBe(`${'a'.repeat(60)}…`);
    expect(entryName({ title: '', excerpt: '  ' }, 'une entrée')).toBe('une entrée');
  });

  it('retire les <mark> et décode les entités, sans interpréter de HTML', () => {
    expect(plainText('<mark>Anxiété</mark> &amp; insomnie &lt;b&gt;')).toBe(
      'Anxiété & insomnie <b>',
    );
    expect(plainText('l&#39;entretien &#x2014; fin')).toBe("l'entretien — fin");
    expect(plainText(null)).toBeNull();
    expect(plainText('   ')).toBeNull();
  });
});
