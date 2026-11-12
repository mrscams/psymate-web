import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { PatientShellApi } from './patient-shell.api';
import {
  closedSession,
  intakeSession,
  notedEntry,
  openSession,
  previousSession,
  reminders,
  shellPatient,
} from './patient-shell.fixtures';
import { ShellSession } from './patient-shell.model';
import { PatientShellStore } from './patient-shell.store';

const forbidden = { status: 403, code: 'PATIENT_FORBIDDEN' };
const notFound = { status: 404, code: 'PATIENT_NOT_FOUND' };
const alreadyOpen = { status: 409, code: 'SESSION_ALREADY_OPEN' };
const alreadyClosed = { status: 409, code: 'SESSION_ALREADY_CLOSED' };
const outOfRange = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [{ field: 'durationMin', code: 'OUT_OF_RANGE', message: 'Entre 1 et 600 minutes.' }],
};

function setup(api: Partial<PatientShellApi>, defaultDurationMin = 60) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PatientShellStore,
      // Mois de la première séance (UX-G2c) : aucune séance par défaut.
      {
        provide: PatientShellApi,
        useValue: {
          firstSessionMonth: vi.fn().mockResolvedValue(null),
          // Onglet Séance (UX-S3) : rien de noté, aucun lien, pas de séance précédente.
          sessionEntries: vi.fn().mockResolvedValue([]),
          linkSentence: vi.fn().mockResolvedValue(null),
          previousSession: vi.fn().mockResolvedValue(null),
          reminders: vi.fn().mockResolvedValue(reminders()),
          emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
          ...api,
        },
      },
      { provide: PreferencesStore, useValue: { defaultDurationMin: signal(defaultDurationMin) } },
    ],
  });
  return TestBed.inject(PatientShellStore);
}

/** Store chargé sur Marie avec la séance courante donnée. */
async function loaded(
  session: ShellSession | null,
  api: Partial<PatientShellApi> = {},
  prefs = 60,
) {
  const store = setup(
    {
      patient: vi.fn().mockResolvedValue(shellPatient()),
      current: vi.fn().mockResolvedValue(session),
      ...api,
    },
    prefs,
  );
  await store.load('p-marie');
  return store;
}

describe('PatientShellStore', () => {
  describe('load', () => {
    it.each([
      ['séance ouverte → en cours', openSession(), 's-open', null],
      ['séance clôturée → dernière séance', closedSession(), null, 's-closed'],
      ['contact clôturé → dernière séance', closedSession({ kind: 'contact' }), null, 's-closed'],
      ['accueil seul → ni en cours ni dernière', intakeSession(), null, null],
      ['aucune séance (NO_CURRENT_SESSION → null)', null, null, null],
    ])('%s', async (_label, session, current, last) => {
      const store = setup({
        patient: vi.fn().mockResolvedValue(shellPatient()),
        current: vi.fn().mockResolvedValue(session),
      });
      const pending = store.load('p-marie');
      expect(store.status()).toBe('loading');
      expect(store.patient()).toBeNull();
      await pending;
      expect(store.status()).toBe('idle');
      expect(store.patient()?.displayName).toBe('Marie D.');
      expect(store.currentSession()?.id ?? null).toBe(current);
      expect(store.lastSession()?.id ?? null).toBe(last);
    });

    it.each([
      ['403 PATIENT_FORBIDDEN', forbidden],
      ['404 PATIENT_NOT_FOUND', notFound],
      ['500', { status: 500, code: 'INTERNAL_ERROR' }],
    ])('%s → état erreur du shell, problème gardé', async (_label, problem) => {
      const store = setup({
        patient: vi.fn().mockRejectedValue(problem),
        current: vi.fn().mockRejectedValue(problem),
      });
      await store.load('p-karim');
      expect(store.status()).toBe('error');
      expect(store.problem()?.code).toBe(problem.code);
      expect(store.patient()).toBeNull();
    });

    it('un autre dossier efface tout, mémoire des onglets comprise ; le même la garde', async () => {
      const store = await loaded(openSession());
      store.rememberTab('timeline', { zoom: 2 });
      await store.load('p-marie');
      expect(store.recallTab('timeline')).toEqual({ zoom: 2 });

      const pending = store.load('p-omar');
      expect(store.patient()).toBeNull();
      expect(store.currentSession()).toBeNull();
      expect(store.recallTab('timeline')).toBeUndefined();
      await pending;
    });

    it("une réponse d'un dossier quitté entre-temps est ignorée", async () => {
      let resolveFirst: (value: ReturnType<typeof shellPatient>) => void = () => undefined;
      const patient = vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(shellPatient({ id: 'p-omar', displayName: 'Omar B.' }));
      const store = setup({ patient, current: vi.fn().mockResolvedValue(null) });
      const first = store.load('p-marie');
      await store.load('p-omar');
      resolveFirst(shellPatient());
      await first;
      expect(store.patient()?.displayName).toBe('Omar B.');
    });
  });

  describe('séances', () => {
    it('startSession : saving puis « en cours » avec la réponse, modalité en présentiel', async () => {
      const start = vi.fn().mockResolvedValue(openSession());
      const store = await loaded(closedSession(), { start });
      const pending = store.startSession();
      expect(store.busy()).toBe(true);
      expect(await pending).toBe(true);
      expect(start).toHaveBeenCalledWith('p-marie', 'in_person');
      expect(store.busy()).toBe(false);
      expect(store.currentSession()?.id).toBe('s-open');
      expect(store.lastSession()?.id).toBe('s-closed');
    });

    it.each([
      ['modalité du suivi (fiche 16) : visio', 'video', undefined, 'video'],
      ['modalité donnée explicitement', 'video', 'phone', 'phone'],
    ] as const)('startSession, %s', async (_label, followed, given, sent) => {
      const start = vi.fn().mockResolvedValue(openSession());
      const store = await loaded(null, {
        patient: vi.fn().mockResolvedValue(shellPatient({ sessionModality: followed })),
        start,
      });
      await store.startSession(given);
      expect(start).toHaveBeenCalledWith('p-marie', sent);
    });

    it('startSession 409 SESSION_ALREADY_OPEN → problème et séance relue', async () => {
      const current = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(openSession());
      const store = await loaded(null, {
        current,
        start: vi.fn().mockRejectedValue(alreadyOpen),
      });
      expect(await store.startSession()).toBe(false);
      expect(store.actionProblem()?.code).toBe('SESSION_ALREADY_OPEN');
      expect(store.status()).toBe('idle');
      expect(store.currentSession()?.id).toBe('s-open');
    });

    it('startSession ne fait rien si une séance est déjà en cours', async () => {
      const start = vi.fn();
      const store = await loaded(openSession(), { start });
      expect(await store.startSession()).toBe(false);
      expect(start).not.toHaveBeenCalled();
    });

    it.each([
      ['préférence 60 min par défaut', {}, 60, { durationMin: 60, summary: undefined }],
      ['préférence 45 min', {}, 45, { durationMin: 45, summary: undefined }],
      [
        'durée et compte rendu saisis',
        { durationMin: 50, summary: '  Bonne séance  ' },
        60,
        { durationMin: 50, summary: 'Bonne séance' },
      ],
    ])('closeSession, %s', async (_label, input, prefs, body) => {
      const closed = closedSession({ id: 's-open', durationMin: body.durationMin });
      const close = vi.fn().mockResolvedValue(closed);
      const store = await loaded(openSession(), { close }, prefs);
      expect(store.defaultDurationMin()).toBe(prefs);
      expect(await store.closeSession(input)).toBe(true);
      expect(close).toHaveBeenCalledWith('s-open', body);
      expect(store.currentSession()).toBeNull();
      expect(store.lastSession()).toEqual(closed);
    });

    it.each([
      ['422 → problème pour le formulaire, séance toujours en cours', outOfRange, 's-open', 1],
      ['409 SESSION_ALREADY_CLOSED → séance relue', alreadyClosed, null, 2],
    ])('closeSession %s', async (_label, problem, current, reads) => {
      const currentApi = vi
        .fn()
        .mockResolvedValueOnce(openSession())
        .mockResolvedValueOnce(closedSession({ id: 's-open' }));
      const store = await loaded(null, {
        current: currentApi,
        close: vi.fn().mockRejectedValue(problem),
      });
      expect(await store.closeSession({ durationMin: 0 })).toBe(false);
      expect(store.actionProblem()?.code).toBe(problem.code);
      expect(store.currentSession()?.id ?? null).toBe(current);
      expect(currentApi).toHaveBeenCalledTimes(reads);
      store.clearActionProblem();
      expect(store.actionProblem()).toBeNull();
    });

    it('closeSession sans séance en cours ne fait rien', async () => {
      const close = vi.fn();
      const store = await loaded(closedSession(), { close });
      expect(await store.closeSession()).toBe(false);
      expect(close).not.toHaveBeenCalled();
    });

    it('contactSession : POST contact puis séance relue (le contact devient la dernière)', async () => {
      const contact = vi.fn().mockResolvedValue(closedSession({ id: 'c1', kind: 'contact' }));
      const current = vi
        .fn()
        .mockResolvedValueOnce(intakeSession())
        .mockResolvedValueOnce(closedSession({ id: 'c1', kind: 'contact' }));
      const store = await loaded(null, { contact, current });
      const input = {
        modality: 'phone' as const,
        occurredFrom: '2026-11-08T09:00:00Z',
        body: 'Appel',
      };
      expect(await store.contactSession(input)).toBe(true);
      expect(contact).toHaveBeenCalledWith('p-marie', input);
      expect(store.lastSession()?.id).toBe('c1');
      expect(store.currentSession()).toBeNull();
    });
  });

  describe('mémoire des onglets', () => {
    it('rememberTab / recallTab par onglet, sans mélanger', async () => {
      const store = await loaded(null);
      expect(store.recallTab('overview')).toBeUndefined();
      store.rememberTab('overview', { count: 3 });
      store.rememberTab('graph', { zoom: 1.5 });
      store.rememberTab('overview', { count: 4 });
      expect(store.recallTab<{ count: number }>('overview')?.count).toBe(4);
      expect(store.recallTab('graph')).toEqual({ zoom: 1.5 });
      expect(store.recallTab('timeline')).toBeUndefined();
    });
  });

  describe('écritures (relecture des projections, M4-05)', () => {
    it('séance démarrée, clôturée, contact, noteWrite : revision augmente ; un échec non', async () => {
      const store = await loaded(null, {
        start: vi.fn().mockResolvedValue(openSession()),
        close: vi.fn().mockResolvedValue(closedSession({ id: 's-open' })),
        contact: vi.fn().mockRejectedValue(alreadyOpen),
      });
      expect(store.revision()).toBe(0);
      await store.startSession();
      expect(store.revision()).toBe(1);
      await store.closeSession();
      expect(store.revision()).toBe(2);
      await store.contactSession({
        modality: 'phone',
        occurredFrom: '2026-11-08T09:00:00Z',
        body: 'Appel',
      });
      expect(store.revision()).toBe(2);
      store.noteWrite();
      expect(store.revision()).toBe(3);
    });

    it('un autre dossier ne remet pas revision à zéro (jamais de faux « rien n’a changé »)', async () => {
      const store = await loaded(null);
      store.noteWrite();
      await store.load('p-omar');
      expect(store.revision()).toBe(1);
    });
  });

  describe('première entrée (M7-03, parcours guidé)', () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it.each([
      ['aucune séance', null],
      ['accueil seul', intakeSession()],
    ])('dossier neuf (%s) sans entrée : pending', async (_label, session) => {
      const hasEntries = vi.fn().mockResolvedValue(false);
      const store = await loaded(session, { hasEntries });
      await tick();
      expect(hasEntries).toHaveBeenCalledWith('p-marie');
      expect(store.firstEntry()).toBe('pending');
    });

    it('dossier neuf avec une entrée : done', async () => {
      const store = await loaded(intakeSession(), { hasEntries: vi.fn().mockResolvedValue(true) });
      await tick();
      expect(store.firstEntry()).toBe('done');
    });

    it('dossier déjà suivi (séance ordinaire) : aucune lecture, unknown', async () => {
      const hasEntries = vi.fn();
      const store = await loaded(closedSession(), { hasEntries });
      await tick();
      expect(hasEntries).not.toHaveBeenCalled();
      expect(store.firstEntry()).toBe('unknown');
    });

    it('lecture en échec : unknown (pas d’indice plutôt qu’un indice faux)', async () => {
      const store = await loaded(null, {
        hasEntries: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      });
      await tick();
      expect(store.firstEntry()).toBe('unknown');
    });

    it('après une écriture, la chronologie est relue (pas de déduction locale)', async () => {
      const hasEntries = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const store = await loaded(intakeSession(), { hasEntries });
      await tick();
      expect(store.firstEntry()).toBe('pending');
      store.noteWrite();
      await tick();
      expect(hasEntries).toHaveBeenCalledTimes(2);
      expect(store.firstEntry()).toBe('done');
      store.noteWrite();
      await tick();
      expect(hasEntries).toHaveBeenCalledTimes(2);
    });
  });

  describe('followedSince : « suivi·e depuis » de l’en-tête (UX-G2c)', () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it.each([
      ['aucune séance : la fiche', null, '2025-03-04'],
      ['première séance après le début du suivi', '2025-04', '2025-03-04'],
      ['première séance le même mois', '2025-03', '2025-03-04'],
      ['dossier créé après ses séances : mention retirée', '2023-11', null],
    ])('%s', async (_label, month, expected) => {
      const firstSessionMonth = vi.fn().mockResolvedValue(month);
      const store = await loaded(closedSession(), { firstSessionMonth });
      await tick();
      expect(firstSessionMonth).toHaveBeenCalledWith('p-marie');
      expect(store.followedSince()).toBe(expected);
    });

    it('lu avec le dossier : l’en-tête ne s’affiche qu’une fois la première séance connue', async () => {
      let resolve: (month: string | null) => void = () => undefined;
      const store = setup({
        patient: vi.fn().mockResolvedValue(shellPatient()),
        current: vi.fn().mockResolvedValue(closedSession()),
        firstSessionMonth: vi.fn(() => new Promise<string | null>((r) => (resolve = r))),
      });
      const pending = store.load('p-marie');
      await tick();
      expect(store.status()).toBe('loading');
      expect(store.patient()).toBeNull();
      resolve('2025-04');
      await pending;
      expect(store.status()).toBe('idle');
      expect(store.followedSince()).toBe('2025-03-04');
    });

    it('lecture des séances en échec : le dossier s’ouvre, sans date de suivi', async () => {
      const store = await loaded(closedSession(), {
        firstSessionMonth: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      });
      expect(store.status()).toBe('idle');
      expect(store.patient()?.displayName).toBe('Marie D.');
      expect(store.followedSince()).toBeNull();
    });

    it('relue après une écriture (séance saisie à une date passée)', async () => {
      const firstSessionMonth = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('2024-01');
      const store = await loaded(closedSession(), { firstSessionMonth });
      await tick();
      expect(store.followedSince()).toBe('2025-03-04');
      store.noteWrite();
      await tick();
      expect(firstSessionMonth).toHaveBeenCalledTimes(2);
      expect(store.followedSince()).toBeNull();
    });
  });

  describe('waitForSession (accueil créé en différé, M7-03)', () => {
    it('relit la séance courante jusqu’à l’arrivée de l’accueil', async () => {
      const current = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(intakeSession());
      const store = await loaded(null, { current, hasEntries: vi.fn().mockResolvedValue(false) });
      current.mockClear();
      current.mockResolvedValueOnce(null).mockResolvedValueOnce(intakeSession());
      await expect(store.waitForSession(5, 0)).resolves.toBe(true);
      expect(current).toHaveBeenCalledTimes(2);
    });

    it('séance déjà là : une seule lecture', async () => {
      const store = await loaded(openSession());
      await expect(store.waitForSession(5, 0)).resolves.toBe(true);
      expect(store.currentSession()?.id).toBe('s-open');
    });

    it('toujours aucune séance : false après le nombre de lectures prévu', async () => {
      const current = vi.fn().mockResolvedValue(null);
      const store = await loaded(null, { current, hasEntries: vi.fn().mockResolvedValue(false) });
      current.mockClear();
      await expect(store.waitForSession(3, 0)).resolves.toBe(false);
      expect(current).toHaveBeenCalledTimes(3);
    });

    it('lecture en échec : false, sans relance', async () => {
      const current = vi.fn().mockResolvedValue(null);
      const store = await loaded(null, { current, hasEntries: vi.fn().mockResolvedValue(false) });
      current.mockReset().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });
      await expect(store.waitForSession(3, 0)).resolves.toBe(false);
      expect(current).toHaveBeenCalledTimes(1);
    });
  });

  describe('onglet Séance (UX-S3) : noté pendant la séance, contexte, clôture', () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const linked = notedEntry({ id: 'e-2', type: 'feeling', emotionCode: 'anxiety', linkCount: 1 });

    it('séance ouverte au chargement : la chronologie filtrée est lue, les liens des entrées qui en ont', async () => {
      const sessionEntries = vi.fn().mockResolvedValue([linked, notedEntry()]);
      const linkSentence = vi
        .fn()
        .mockResolvedValue({ sentence: 'Anxiété déclenchée par Réorg', count: 1 });
      const store = await loaded(openSession(), { sessionEntries, linkSentence });
      await tick();
      expect(sessionEntries).toHaveBeenCalledWith('p-marie', 's-open');
      expect(store.noted().status).toBe('loaded');
      expect(store.notedCount()).toBe(2);
      expect(linkSentence).toHaveBeenCalledTimes(1);
      expect(linkSentence).toHaveBeenCalledWith('e-2');
      expect(store.links()['e-2']).toEqual({
        status: 'loaded',
        sentence: 'Anxiété déclenchée par Réorg',
        count: 1,
      });
    });

    it('séance clôturée ou accueil : rien n’est lu', async () => {
      const sessionEntries = vi.fn();
      await loaded(closedSession(), { sessionEntries });
      await loaded(intakeSession(), { sessionEntries });
      expect(sessionEntries).not.toHaveBeenCalled();
    });

    it('lecture en échec : état erreur, refreshNoted relit', async () => {
      const sessionEntries = vi
        .fn()
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValueOnce([notedEntry()]);
      const store = await loaded(openSession(), { sessionEntries });
      await tick();
      expect(store.noted().status).toBe('error');
      expect(store.noted().problem?.code).toBe('INTERNAL_ERROR');
      await store.refreshNoted();
      expect(store.noted().status).toBe('loaded');
      expect(store.notedCount()).toBe(1);
    });

    it('noteWrite(entryId) : la liste est relue, la ligne à surligner retenue, la liste précédente gardée pendant la relecture', async () => {
      const sessionEntries = vi
        .fn()
        .mockResolvedValueOnce([notedEntry()])
        .mockResolvedValueOnce([notedEntry({ id: 'e-9' }), notedEntry()]);
      const store = await loaded(openSession(), { sessionEntries });
      await tick();
      store.noteWrite('e-9');
      expect(store.lastWrittenId()).toBe('e-9');
      expect(store.noted().status).toBe('loading');
      expect(store.noted().data).toHaveLength(1);
      await tick();
      expect(store.noted().data?.map((e) => e.id)).toEqual(['e-9', 'e-1']);
      store.clearLastWritten();
      expect(store.lastWrittenId()).toBeNull();
    });

    it('un lien posé après coup (linkCount changé) : la phrase est relue ; sinon pas de relecture', async () => {
      const sessionEntries = vi
        .fn()
        .mockResolvedValueOnce([linked])
        .mockResolvedValueOnce([linked])
        .mockResolvedValueOnce([{ ...linked, linkCount: 2 }]);
      const linkSentence = vi.fn().mockResolvedValue({ sentence: 'phrase', count: 1 });
      const store = await loaded(openSession(), { sessionEntries, linkSentence });
      await tick();
      store.noteWrite();
      await tick();
      expect(linkSentence).toHaveBeenCalledTimes(1);
      store.noteWrite();
      await tick();
      expect(linkSentence).toHaveBeenCalledTimes(2);
    });

    it('loadContext : séance précédente, rappels et vocabulaire en une fois ; pas deux fois ; force relit', async () => {
      const previous = vi.fn().mockResolvedValue(previousSession());
      const store = await loaded(openSession(), { previousSession: previous });
      await store.loadContext();
      expect(previous).toHaveBeenCalledWith('p-marie', 's-open');
      expect(store.context().status).toBe('loaded');
      expect(store.context().data?.previous?.id).toBe('s-closed');
      expect(store.context().data?.reminders.medications[0].molecule).toBe('Mélatonine');
      expect(store.context().data?.emotionLabels['anxiety']).toBe('Anxiété');
      await store.loadContext();
      expect(previous).toHaveBeenCalledTimes(1);
      await store.loadContext(true);
      expect(previous).toHaveBeenCalledTimes(2);
    });

    it('loadContext en échec : état erreur ; sans séance ouverte : rien', async () => {
      const store = await loaded(openSession(), {
        reminders: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      });
      await store.loadContext();
      expect(store.context().status).toBe('error');
      const idle = await loaded(closedSession());
      await idle.loadContext();
      expect(idle.context().status).toBe('idle');
    });

    it('une autre séance démarrée : la liste repart de zéro et est lue pour elle', async () => {
      const sessionEntries = vi.fn().mockResolvedValue([]);
      const store = await loaded(closedSession(), {
        sessionEntries,
        start: vi.fn().mockResolvedValue(openSession({ id: 's-new' })),
      });
      await store.startSession();
      await tick();
      expect(sessionEntries).toHaveBeenCalledWith('p-marie', 's-new');
      expect(store.notedSessionId()).toBe('s-new');
    });

    it('durée prévue : followUp.durationMin du dossier, sinon la préférence', async () => {
      const fromPrefs = await loaded(openSession(), {}, 45);
      expect(fromPrefs.plannedDurationMin()).toBe(45);
      const fromRecord = await loaded(openSession(), {
        patient: vi.fn().mockResolvedValue(shellPatient({ plannedDurationMin: 50 })),
      });
      expect(fromRecord.plannedDurationMin()).toBe(50);
    });

    it('brouillon de clôture gardé puis effacé par la clôture ; la séance clôturée retenue pour le toast', async () => {
      const closed = closedSession({ id: 's-open', durationMin: 48 });
      const store = await loaded(openSession(), { close: vi.fn().mockResolvedValue(closed) });
      const draft = { sessionId: 's-open', durationMin: '48', summary: 'Thème', nextTime: ['a'] };
      store.keepCloseDraft(draft);
      expect(store.closeDraft()).toEqual(draft);
      await store.closeSession({ durationMin: 48, summary: 'Thème' });
      expect(store.closeDraft()).toBeNull();
      expect(store.lastClosed()).toEqual({ session: closed, withSummary: true });
      store.clearLastClosed();
      expect(store.lastClosed()).toBeNull();
    });

    it('clôture sans compte rendu : withSummary false', async () => {
      const store = await loaded(openSession(), {
        close: vi.fn().mockResolvedValue(closedSession({ id: 's-open' })),
      });
      await store.closeSession({ durationMin: 50, summary: '   ' });
      expect(store.lastClosed()?.withSummary).toBe(false);
    });

    it('requestPrefill : chaque demande a un numéro croissant ; consommée, elle s’efface', async () => {
      const store = await loaded(openSession());
      store.requestPrefill('Agenda du sommeil : ');
      expect(store.prefillRequest()).toEqual({ text: 'Agenda du sommeil : ', seq: 1 });
      store.requestPrefill('Certificat : ');
      expect(store.prefillRequest()?.seq).toBe(2);
      store.clearPrefill();
      expect(store.prefillRequest()).toBeNull();
    });

    it('une demande non consommée ne survit ni à la clôture ni au démarrage suivant', async () => {
      const store = await loaded(openSession(), {
        close: vi.fn().mockResolvedValue(closedSession({ id: 's-open' })),
        start: vi.fn().mockResolvedValue(openSession({ id: 's-next' })),
      });
      store.requestPrefill('Agenda du sommeil : ');
      await store.closeSession({ durationMin: 50 });
      expect(store.prefillRequest()).toBeNull();
      store.requestPrefill('Certificat : ');
      await store.startSession();
      expect(store.prefillRequest()).toBeNull();
    });

    it('noteWrite : séance précédente et rappels relus en silence, le contexte reste affiché', async () => {
      const previous = vi.fn().mockResolvedValue(previousSession());
      const remind = vi.fn().mockResolvedValue(reminders());
      const store = await loaded(openSession(), { previousSession: previous, reminders: remind });
      await store.loadContext();
      remind.mockResolvedValue(
        reminders({
          medications: [{ entryId: 'm-2', molecule: 'Sertraline', dosage: '50 mg', since: null }],
        }),
      );
      store.noteWrite('e-9');
      expect(store.context().status).toBe('loaded');
      await tick();
      await tick();
      expect(previous).toHaveBeenCalledTimes(2);
      expect(store.context().data?.reminders.medications[0].molecule).toBe('Sertraline');
      expect(store.context().data?.emotionLabels['anxiety']).toBe('Anxiété');
    });
  });
});
