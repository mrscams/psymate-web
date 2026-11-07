import { highlightParts } from '../ui/highlight';
import { patient, VERSIONS } from './patient.fixtures';
import {
  diffPatient,
  emptyForm,
  normalizeText,
  PatientFormValue,
  toCreateInput,
  toFormValue,
  versionDiffs,
} from './patient.model';

function form(overrides: Partial<PatientFormValue> = {}): PatientFormValue {
  return { ...emptyForm(60), ...overrides };
}

describe('patient.model', () => {
  describe('toCreateInput', () => {
    it.each([
      [
        'nom seul : les champs vides et la durée par défaut seule partent',
        form({ displayName: '  Marie D. ' }),
        [],
        { displayName: 'Marie D.', followUp: { durationMin: 60 } },
      ],
      [
        'suivi : mois → AAAA-MM-01, durée en nombre',
        form({
          displayName: 'Léa',
          followUp: { ...emptyForm(null).followUp, since: '2025-03', rhythm: 'monthly' },
        }),
        [],
        { displayName: 'Léa', followUp: { since: '2025-03-01', rhythm: 'monthly' } },
      ],
      [
        'drapeaux cochés et tags',
        form({
          displayName: 'Paul',
          pronoun: 'il',
          flags: { watch: true, watchReason: ' Sommeil ', risk: true, sharedCare: false },
        }),
        ['travail'],
        {
          displayName: 'Paul',
          pronoun: 'il',
          followUp: { durationMin: 60 },
          flags: [{ kind: 'watch', reason: 'Sommeil' }, { kind: 'risk' }],
          tags: ['travail'],
        },
      ],
    ])('%s', (_label, value, tags, expected) => {
      expect(toCreateInput(value, tags)).toEqual(expected);
    });
  });

  describe('diffPatient', () => {
    const marie = patient({
      flags: [{ kind: 'watch', reason: 'Sommeil', setAt: '2026-11-02T10:00:00Z' }],
    });

    it.each<[string, (v: PatientFormValue) => PatientFormValue, string[], object]>([
      [
        'rien de changé : aucun appel',
        (v) => v,
        ['travail'],
        { patch: null, flagsToClear: [], flagsToSet: [], tags: null },
      ],
      [
        'rythme modifié : PATCH followUp clé à clé',
        (v) => ({ ...v, followUp: { ...v.followUp, rhythm: 'monthly' } }),
        ['travail'],
        {
          patch: { followUp: { rhythm: 'monthly' } },
          flagsToClear: [],
          flagsToSet: [],
          tags: null,
        },
      ],
      [
        'champ vidé : null efface ; prénom changé',
        (v) => ({
          ...v,
          birthDate: '',
          firstName: 'Mary',
          context: { ...v.context, activity: '' },
        }),
        ['travail'],
        {
          patch: { firstName: 'Mary', birthDate: null, context: { activity: null } },
          flagsToClear: [],
          flagsToSet: [],
          tags: null,
        },
      ],
      [
        'raison de « à surveiller » changée : lever puis reposer ; risque posé',
        (v) => ({ ...v, flags: { ...v.flags, watchReason: 'Isolement', risk: true } }),
        ['travail'],
        {
          patch: null,
          flagsToClear: ['watch'],
          flagsToSet: [{ kind: 'watch', reason: 'Isolement' }, { kind: 'risk' }],
          tags: null,
        },
      ],
      [
        'drapeau décoché et tags remplacés',
        (v) => ({ ...v, flags: { ...v.flags, watch: false } }),
        ['travail', 'santé'],
        { patch: null, flagsToClear: ['watch'], flagsToSet: [], tags: ['travail', 'santé'] },
      ],
    ])('%s', (_label, change, tags, expected) => {
      expect(diffPatient(marie, change(toFormValue(marie)), tags)).toEqual(expected);
    });
  });

  it('toFormValue : since en mois, durée en texte, drapeaux en cases', () => {
    const value = toFormValue(
      patient({ flags: [{ kind: 'shared_care', reason: null, setAt: null }] }),
    );
    expect(value.followUp.since).toBe('2025-03');
    expect(value.followUp.durationMin).toBe('50');
    expect(value.flags).toEqual({ watch: false, watchReason: '', risk: false, sharedCare: true });
  });

  it('versionDiffs : récente d’abord, différence champ par champ, la 2 sans état antérieur', () => {
    const diffs = versionDiffs(VERSIONS);
    expect(diffs.map((d) => d.version)).toEqual([3, 2]);
    expect(diffs[0]).toMatchObject({
      baseUnknown: false,
      reason: 'Nouveau rythme',
      changes: [{ field: 'followUp.rhythm', before: 'weekly', after: 'monthly' }],
    });
    expect(diffs[1].baseUnknown).toBe(true);
    expect(diffs[1].changes.map((c) => c.field)).toEqual([
      'displayName',
      'firstName',
      'birthDate',
      'followUp.rhythm',
    ]);
    expect(diffs[1].changes[0].before).toBeUndefined();
  });

  it.each([
    ['Marié', 'marie'],
    ['  Éloïse   Ç. ', ' eloise c. '],
  ])('normalizeText(%s) = %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it.each([
    [
      'Marie D.',
      'marié',
      [
        { text: 'Marie', match: true },
        { text: ' D.', match: false },
      ],
    ],
    [
      'Omar B.',
      'mar',
      [
        { text: 'O', match: false },
        { text: 'mar', match: true },
        { text: ' B.', match: false },
      ],
    ],
    [
      'Éloïse',
      'elo',
      [
        { text: 'Élo', match: true },
        { text: 'ïse', match: false },
      ],
    ],
    ['Léa', '', [{ text: 'Léa', match: false }]],
  ])('highlightParts(%s, %s)', (text, query, expected) => {
    expect(highlightParts(text, query)).toEqual(expected);
  });
});
