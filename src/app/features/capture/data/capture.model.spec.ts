import { parse } from '../parser/parse';
import { CASE_OPTIONS } from '../parser/parse.cases';
import { CANDIDATES, candidate, EMOTIONS, LINK_TYPES } from './capture.fixtures';
import {
  buildPreview,
  CaptureDraft,
  civilDay,
  composeEntry,
  dayAfter,
  dayOccurred,
  detectedGrammar,
  EMPTY_DRAFT,
  emotionLabelOf,
  findTarget,
  fold,
  mergeLinks,
  monthOccurred,
  reconcileDraft,
  replaceWord,
  slotOfField,
  snapshotOf,
  targetLink,
  toPrefill,
  yearOccurred,
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

// Bloc de saisie structuré (UX-S1) : brouillon, réconciliation et composition ---------------------

const COMPOSE = {
  emotions: EMOTIONS,
  candidates: CANDIDATES,
  linkTypes: LINK_TYPES,
  defaultVisibility: 'clinical' as const,
  rest: '',
};
const compose = (input: string, draft: CaptureDraft = EMPTY_DRAFT, rest = '') =>
  composeEntry(preview(input), draft, { ...COMPOSE, rest });

describe('capture.model (bloc de saisie)', () => {
  it('reconcileDraft : la puce suit la grammaire ; ce qui n’a pas bougé garde le choix', () => {
    const first = snapshotOf(preview('se réveille vers 3 h'))!;
    let draft = reconcileDraft(
      { ...EMPTY_DRAFT, type: 'feeling', overrides: { emotionCode: 'anger', intensity: 4 } },
      first,
    );
    expect(draft.type).toBe('feeling');
    // La même lecture : rien ne change.
    expect(reconcileDraft(draft, first)).toEqual(draft);
    // « anx 7 » : le type lu change (note → ressenti), la puce cliquée s'efface ; l'émotion lue
    // change (aucune → anxiety), l'émotion choisie s'efface ; l'intensité aussi.
    draft = reconcileDraft(draft, snapshotOf(preview('anx 7 se réveille vers 3 h'))!);
    expect(draft.type).toBeNull();
    expect(draft.overrides).toEqual({});
    // Un titre posé à la main tombe quand le texte change ; le moment choisi reste.
    draft = reconcileDraft(
      { ...draft, overrides: { title: 'Réveil', when: null } },
      snapshotOf(preview('anx 7 se réveille vers 4 h'))!,
    );
    expect(draft.overrides).toEqual({ when: null });
    // Un nouveau `>` remplace la puce de lien cliquée et la cible retirée.
    draft = reconcileDraft(
      {
        ...draft,
        pickedLink: { targetId: 'e-note', linkType: 'co_occurs', direction: 'outgoing' },
        dismissedTarget: 'e-situation',
      },
      snapshotOf(preview('anx 7 se réveille > entretien'))!,
    );
    expect(draft.pickedLink).toBeNull();
    expect(draft.dismissedTarget).toBeNull();
    // Saisie vidée, bloc replié : tout à zéro.
    expect(reconcileDraft(draft, null)).toBe(EMPTY_DRAFT);
  });

  it('composeEntry : la grammaire seule (« anx 7 … > réorg ») : ressenti, champs, lien par la matrice', () => {
    const c = compose("anx 8 n'a pas dormi > entretien");
    expect(c).toMatchObject({
      type: 'feeling',
      intensity: 8,
      body: "n'a pas dormi",
      when: null,
      visibility: 'clinical',
      missing: [],
      blocking: false,
    });
    expect(c.emotion?.code).toBe('anxiety');
    expect(c.link).toMatchObject({
      name: 'Entretien annuel',
      from: 'target',
      choice: { linkType: 'triggers', direction: 'incoming', label: 'déclenché par' },
    });
    expect(c.link?.choices.map((choice) => choice.label)).toEqual([
      'déclenché par',
      'survient avec',
      'est causé par',
    ]);
    expect(c.prefill).toEqual({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      occurred: null,
      links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
    });
  });

  it('composeEntry : la grammaire suit la puce (Ressenti cliqué sans intensité, Événement, Médicament)', () => {
    // Puce Ressenti sur « colère ruminations » : l'émotion du mot de tête, sans intensité, retirée du texte.
    const feeling = compose('colère ruminations', { ...EMPTY_DRAFT, type: 'feeling' });
    expect(feeling.emotion?.code).toBe('anger');
    expect(feeling.intensity).toBeNull();
    expect(feeling.body).toBe('ruminations');
    expect(feeling.missing).toEqual([]);
    expect(feeling.warnings).toEqual([]);
    // Puce Ressenti sur un texte sans émotion : l'émotion manque, Entrée est bloquée.
    const empty = compose('se réveille vers 3 h', { ...EMPTY_DRAFT, type: 'feeling' });
    expect(empty.emotion).toBeNull();
    expect(empty.missing).toEqual(['emotion']);
    expect(empty.blocking).toBe(true);
    // Puce Événement : le texte devient le titre, les lignes suivantes le corps.
    const event = compose('réunion houleuse', { ...EMPTY_DRAFT, type: 'event' }, 'avec la cadre');
    expect(event.title).toBe('réunion houleuse');
    expect(event.body).toBe('avec la cadre');
    expect(event.prefill).toMatchObject({
      type: 'event',
      title: 'réunion houleuse',
      body: 'avec la cadre',
    });
    // Puce Médicament : premier mot molécule, le reste posologie ; champs posés à la main.
    const med = compose('mélatonine 2 mg le soir', { ...EMPTY_DRAFT, type: 'medication' });
    expect(med).toMatchObject({ molecule: 'mélatonine', dosage: '2 mg le soir' });
    const edited = compose('mélatonine 2 mg le soir', {
      ...EMPTY_DRAFT,
      type: 'medication',
      overrides: { dosage: '2 mg au coucher' },
    });
    expect(edited.prefill.medication).toEqual({
      molecule: 'mélatonine',
      dosage: '2 mg au coucher',
    });
    // Puce Note sur « /evt réunion » : le texte lu reste le corps ; molécule obligatoire vide → bloqué.
    expect(compose('/evt réunion', { ...EMPTY_DRAFT, type: 'note' }).body).toBe('réunion');
    expect(compose('', { ...EMPTY_DRAFT, type: 'medication' }).missing).toEqual(['molecule']);
  });

  it('composeEntry : les champs posés à la main règlent les avertissements ; moment et visibilité', () => {
    // Émotion inconnue tapée, puis choisie dans la liste : plus d'avertissement, le choix part.
    const unknown = compose("stress 7 avant l'examen");
    expect(unknown.warnings.map((item) => item.slot)).toEqual(['emotion']);
    expect(unknown.blocking).toBe(true);
    const chosen = compose("stress 7 avant l'examen", {
      ...EMPTY_DRAFT,
      overrides: { emotionCode: 'anxiety' },
    });
    expect(chosen.warnings).toEqual([]);
    expect(chosen.blocking).toBe(false);
    expect(chosen.prefill.feeling).toEqual({ emotionCode: 'anxiety', intensity: 7 });
    // Intensité hors bornes lue, puis cliquée sur l'échelle.
    expect(compose('anx 12 crise').warnings[0]).toMatchObject({
      slot: 'intensity',
      warning: { code: 'INTENSITY_OUT_OF_RANGE' },
    });
    expect(
      compose('anx 12 crise', { ...EMPTY_DRAFT, overrides: { intensity: 9 } }).warnings,
    ).toEqual([]);
    // Date lue (mardi → jour), puis moment choisi (hier) ou remis à « maintenant ».
    const dated = compose('/evt entretien mardi');
    expect(dated.when).toEqual({ from: '2026-11-10T00:00:00Z', precision: 'day' });
    const now = compose('/evt entretien mardi', { ...EMPTY_DRAFT, overrides: { when: null } });
    expect(now.when).toBeNull();
    expect(now.prefill.occurred).toBeNull();
    // Visibilité : la préférence, puis le choix.
    expect(
      compose('note privée', { ...EMPTY_DRAFT, overrides: { visibility: 'private' } }).visibility,
    ).toBe('private');
  });

  it('composeEntry : UN lien, cliqué, retiré, remplacé, verbe choisi, cible hors rail', () => {
    const picked = (targetId: string, linkType: 'triggers' | 'co_occurs' = 'triggers') =>
      ({
        targetId,
        linkType,
        direction: linkType === 'triggers' ? ('incoming' as const) : ('outgoing' as const),
      }) as const;
    // Clic sur la situation : lien posé, verbe de la matrice.
    const clicked = compose('anx 8 dort mal', {
      ...EMPTY_DRAFT,
      pickedLink: picked('e-situation'),
    });
    expect(clicked.link).toMatchObject({ name: 'Surcharge au travail', from: 'picked' });
    expect(clicked.prefill.links).toEqual([picked('e-situation')]);
    // Clic sur une autre puce : il remplace celui du `>`.
    const replaced = compose('anx 8 > entretien', {
      ...EMPTY_DRAFT,
      pickedLink: picked('e-note', 'co_occurs'),
    });
    expect(replaced.link?.candidate.id).toBe('e-note');
    expect(replaced.link?.choice.label).toBe('survient avec');
    // Second clic sur la cible du `>` : retiré, et aucun problème de cible n'en subsiste.
    const dismissed = compose('anx 8 > entretien', { ...EMPTY_DRAFT, dismissedTarget: 'e-event' });
    expect(dismissed.link).toBeNull();
    expect(dismissed.targetIssue).toBeNull();
    expect(dismissed.prefill.links).toEqual([]);
    // Verbe choisi : gardé s'il est admis pour la paire.
    const verb = compose('anx 8 > entretien', {
      ...EMPTY_DRAFT,
      pickedLink: picked('e-event', 'co_occurs'),
    });
    expect(verb.link?.choice.label).toBe('survient avec');
    // Type changé à la main : un verbe devenu inadmissible retombe sur le premier admis.
    const retyped = compose('anx 8 > entretien', {
      ...EMPTY_DRAFT,
      type: 'medication',
      pickedLink: picked('e-event'),
    });
    expect(retyped.link?.choice.label).toBe('survient avec');
    // Cible venue de « Autre entrée… », hors des cinq du rail.
    const old = candidate({ id: 'e-old', type: 'event', title: "Entretien d'évaluation" });
    const other = compose('anx 8 dort mal', {
      ...EMPTY_DRAFT,
      pickedLink: picked('e-old'),
      extraCandidate: old,
    });
    expect(other.link).toMatchObject({ name: "Entretien d'évaluation", from: 'picked' });
    // Sans la cible sous les yeux, aucun lien ne part en silence.
    expect(
      compose('anx 8 dort mal', { ...EMPTY_DRAFT, pickedLink: picked('e-old') }).link,
    ).toBeNull();
  });

  it('composeEntry : situation en cours ou finie (fin incluse → borne exclusive) ; dates utilitaires', () => {
    const ongoing = compose('/sit surcharge depuis mars');
    expect(ongoing.prefill.occurred).toEqual({ from: '2026-03-01T00:00:00Z', precision: 'month' });
    const ended = compose('/sit surcharge depuis mars', {
      ...EMPTY_DRAFT,
      overrides: { ongoing: false, until: '2026-11-10' },
    });
    expect(ended.prefill.occurred).toEqual({
      from: '2026-03-01T00:00:00Z',
      precision: 'month',
      to: '2026-11-11T00:00:00Z',
    });
    const noEnd = compose('/sit surcharge', { ...EMPTY_DRAFT, overrides: { ongoing: false } });
    expect(noEnd.missing).toEqual(['until']);
    expect(dayAfter('2026-12-31')).toBe('2027-01-01T00:00:00Z');
    expect(dayAfter('31/12/2026')).toBeNull();
    expect(dayOccurred('2026-11-10')).toEqual({ from: '2026-11-10T00:00:00Z', precision: 'day' });
    expect(monthOccurred('2026-11')).toEqual({ from: '2026-11-01T00:00:00Z', precision: 'month' });
    expect(yearOccurred('2024')).toEqual({ from: '2024-01-01T00:00:00Z', precision: 'year' });
    expect(yearOccurred('24')).toBeNull();
    // Jour civil dans le fuseau du praticien : le 10 novembre à 23 h 30 à Paris est encore le 10.
    expect(civilDay(new Date('2026-11-10T22:30:00Z'), 'Europe/Paris')).toBe('2026-11-10');
    expect(civilDay(new Date('2026-11-10T22:30:00Z'), 'Europe/Paris', 1)).toBe('2026-11-09');
    expect(civilDay(new Date('2026-11-10T22:30:00Z'), 'Nowhere/Invalid')).toBe('2026-11-10');
  });

  it('detectedGrammar et slotOfField', () => {
    expect(detectedGrammar('anx 7 se réveille', 'feeling')).toBe('anx 7');
    expect(detectedGrammar('tristesse profonde 5/10 pleure', 'feeling')).toBe(
      'tristesse profonde 5/10',
    );
    expect(detectedGrammar('/evt réunion', 'event')).toBe('/evt');
    expect(detectedGrammar('/xyz réunion', 'note')).toBeNull();
    expect(detectedGrammar('se réveille', 'note')).toBeNull();
    expect(slotOfField('feeling.emotionCode')).toBe('emotion');
    expect(slotOfField('feeling.intensity')).toBe('intensity');
    expect(slotOfField('occurred.from')).toBe('when');
    expect(slotOfField('occurred.to')).toBe('until');
    expect(slotOfField('links[0].targetId')).toBe('link');
    expect(slotOfField('medication.molecule')).toBe('molecule');
    expect(slotOfField('sessionId')).toBe('general');
  });
});
