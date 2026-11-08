import { parse } from '../parser/parse';
import { CASE_OPTIONS } from '../parser/parse.cases';
import { CANDIDATES, candidate, EMOTIONS, LINK_TYPES } from './capture.fixtures';
import {
  buildPreview,
  emotionLabelOf,
  findTarget,
  fold,
  mergeLinks,
  replaceWord,
  targetLink,
  toPrefill,
} from './capture.model';

const context = { emotions: EMOTIONS, candidates: CANDIDATES, linkTypes: LINK_TYPES };
const preview = (input: string) => buildPreview(parse(input, CASE_OPTIONS), context);

describe('capture.model', () => {
  it('B5 « anx 8 n’a pas dormi > entretien » : ressenti, cible trouvée, « déclenché par » proposé', () => {
    const p = preview("anx 8 n'a pas dormi > entretien");
    expect(p).toMatchObject({
      type: 'feeling',
      emotion: { code: 'anxiety', label: 'Anxiété', family: 'fear' },
      intensity: 8,
      text: "n'a pas dormi",
      dateExpression: null,
      targetIssue: null,
      blocking: false,
    });
    expect(p.target?.candidate.id).toBe('e-event');
    expect(p.target?.name).toBe('Entretien annuel');
    expect(p.target?.choice).toMatchObject({
      linkType: 'triggers',
      direction: 'incoming',
      label: 'déclenché par',
    });
    expect(targetLink(p)).toEqual({
      targetId: 'e-event',
      linkType: 'triggers',
      direction: 'incoming',
    });
  });

  it('cible : début du nom, sinon début d’un mot ; sans casse ni accents ; introuvable → bloquant', () => {
    expect(findTarget('SURCH', CANDIDATES, EMOTIONS)?.candidate.id).toBe('e-situation');
    expect(findTarget('travail', CANDIDATES, EMOTIONS)?.candidate.id).toBe('e-situation');
    expect(findTarget('', CANDIDATES, EMOTIONS)).toBeNull();
    // Un ressenti sans titre se nomme « Anxiété 6/10 ».
    const feeling = candidate({
      id: 'e-f',
      type: 'feeling',
      title: null,
      emotionCode: 'anxiety',
      intensity: 6,
    });
    expect(findTarget('anxi', [feeling], EMOTIONS)?.name).toBe('Anxiété 6/10');

    const missing = preview('anx 8 > dispute');
    expect(missing.target).toBeNull();
    expect(missing.targetIssue).toEqual({ code: 'TARGET_NOT_FOUND', query: 'dispute' });
    expect(missing.blocking).toBe(true);
  });

  it('cible incompatible avec la matrice : bloquant, aucun lien proposé', () => {
    // Catalogue sans « survient avec » : un médicament n'a alors aucun type vers une note.
    const linkTypes = LINK_TYPES.filter((type) => type.code !== 'co_occurs');
    const p = buildPreview(parse('/med sertraline > dort', CASE_OPTIONS), {
      ...context,
      linkTypes,
    });
    expect(p.target?.choice).toBeNull();
    expect(p.targetIssue).toEqual({
      code: 'TARGET_NOT_ALLOWED',
      name: 'Dort mal depuis deux semaines',
      targetType: 'note',
    });
    expect(targetLink(p)).toBeNull();
  });

  it('émotion inconnue → proposition ; ambiguë → choix parmi les émotions ; bloquants', () => {
    const unknown = preview("stress 7 avant l'examen");
    expect(unknown).toMatchObject({
      unknownEmotion: 'stress',
      emotion: null,
      intensity: 7,
      blocking: true,
    });
    const ambiguous = preview('tri 5 pleure souvent');
    expect(ambiguous.ambiguous?.word).toBe('tri');
    expect(ambiguous.ambiguous?.candidates.map((e) => e.label)).toEqual([
      'Tristesse',
      'Tristesse profonde',
    ]);
    expect(ambiguous.blocking).toBe(true);
    // Non bloquant : POSSIBLE_FEELING.
    expect(preview("anx n'a pas dormi").blocking).toBe(false);
  });

  it('toPrefill : le texte va au champ du type ; date saisie gardée, sinon « Maintenant »', () => {
    expect(toPrefill(preview('semble plus détendu'), [])).toEqual({
      type: 'note',
      body: 'semble plus détendu',
      occurred: null,
      links: [],
    });
    expect(toPrefill(preview('/evt entretien avec le manager mardi'), [])).toEqual({
      type: 'event',
      title: 'entretien avec le manager',
      occurred: { from: '2026-11-10T00:00:00Z', precision: 'day' },
      links: [],
    });
    expect(toPrefill(preview('/sit surcharge au travail depuis mars'), []).title).toBe(
      'surcharge au travail',
    );
    expect(toPrefill(preview('/med sertraline 50 mg matin'), []).medication).toEqual({
      molecule: 'sertraline',
      dosage: '50 mg matin',
    });
    const link = {
      targetId: 'e-event',
      linkType: 'triggers' as const,
      direction: 'incoming' as const,
    };
    expect(toPrefill(preview("anx 8 n'a pas dormi"), [link])).toEqual({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      occurred: null,
      links: [link],
    });
  });

  it('mergeLinks : le `>` en tête, sauf décoché ou retypé dans le rail', () => {
    const target = {
      targetId: 'e-event',
      linkType: 'triggers' as const,
      direction: 'incoming' as const,
    };
    const other = {
      targetId: 'e-note',
      linkType: 'co_occurs' as const,
      direction: 'outgoing' as const,
    };
    expect(mergeLinks(target, [other], null)).toEqual([target, other]);
    expect(mergeLinks(target, [other], 'e-event')).toEqual([other]);
    const retyped = { ...target, linkType: 'co_occurs' as const, direction: 'outgoing' as const };
    expect(mergeLinks(target, [retyped], null)).toEqual([retyped]);
    expect(mergeLinks(null, [other], null)).toEqual([other]);
  });

  it('replaceWord, emotionLabelOf, fold', () => {
    expect(replaceWord('tri 5 pleure souvent', 'tri', 'Tristesse profonde')).toBe(
      'Tristesse profonde 5 pleure souvent',
    );
    expect(replaceWord('/xyz  TRI 5', 'tri', 'Tristesse')).toBe('/xyz  Tristesse 5');
    expect(replaceWord('rien', 'tri', 'Tristesse')).toBe('rien');
    expect(emotionLabelOf(' stress ')).toBe('Stress');
    expect(emotionLabelOf('')).toBe('');
    expect(fold('  Épuisé   Là ')).toBe('epuise la');
  });
});
