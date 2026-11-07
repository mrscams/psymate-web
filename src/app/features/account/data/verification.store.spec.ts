import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { UploadEvent, Verification, VerificationApi } from './verification.api';
import { VerificationStore } from './verification.store';

export const DOSSIER: Verification = {
  status: 'docs_pending',
  profession: 'psychologist',
  submittedAt: null,
  adminMessage: null,
  decidedAt: null,
  documents: [
    {
      id: 'd1',
      type: 'diploma',
      title: 'Master 2 Psychologie clinique',
      issuer: 'Université Lyon 2',
      year: 2014,
      mime: 'application/pdf',
      sizeBytes: 1_900_000,
      uploadedAt: '2026-10-24T09:00:00Z',
      reviewedStatus: 'pending',
      purged: false,
    },
  ],
  missing: ['identity'],
  recommended: ['registration'],
  professionalInfo: {
    professionalNumber: '',
    phone: '+33600000099',
    remoteOnly: true,
    address: { street: '', postalCode: '', city: '' },
  },
};

const FILE = new File(['%PDF-1.4'], 'piece.pdf', { type: 'application/pdf' });
const INPUT = { type: 'identity' as const, title: 'CNI', issuer: '', year: '' };

function setup(api: Partial<VerificationApi>, me = vi.fn().mockResolvedValue(null)) {
  TestBed.configureTestingModule({
    providers: [
      VerificationStore,
      { provide: VerificationApi, useValue: api },
      { provide: SessionApi, useValue: { me } },
    ],
  });
  return { store: TestBed.inject(VerificationStore), session: TestBed.inject(SessionStore), me };
}

describe('VerificationStore', () => {
  it('load : chargement puis dossier, règle de complétude du serveur reflétée', async () => {
    const { store } = setup({ load: vi.fn().mockResolvedValue(DOSSIER) });
    const pending = store.load();
    expect(store.dossier().status).toBe('loading');
    await pending;
    expect(store.dossier().status).toBe('loaded');
    expect(store.documents()).toHaveLength(1);
    expect(store.missing()).toEqual(['identity']);
    expect(store.editable()).toBe(true);
    expect(store.canSubmit()).toBe(false);
  });

  it('load en erreur : état erreur avec le problème, donnée précédente conservée', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(DOSSIER)
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' });
    const { store } = setup({ load });
    await store.load();
    await store.load();
    expect(store.dossier().status).toBe('error');
    expect(store.dossier().problem?.code).toBe('INTERNAL_ERROR');
    expect(store.dossier().data).toEqual(DOSSIER);
  });

  it('upload : progression, puis relecture du dossier (jamais de calcul local)', async () => {
    const complete: Verification = { ...DOSSIER, missing: [], documents: [...DOSSIER.documents] };
    const load = vi.fn().mockResolvedValueOnce(DOSSIER).mockResolvedValueOnce(complete);
    const upload = vi.fn().mockReturnValue(
      new Observable<UploadEvent>((subscriber) => {
        subscriber.next({ kind: 'progress', percent: 40 });
        subscriber.next({ kind: 'progress', percent: 100 });
        subscriber.next({ kind: 'done', document: DOSSIER.documents[0] });
        subscriber.complete();
      }),
    );
    const { store } = setup({ load, upload });
    await store.load();
    await expect(store.uploadDocument(INPUT, FILE)).resolves.toBe(true);
    expect(upload).toHaveBeenCalledWith(INPUT, FILE);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.upload().status).toBe('idle');
    expect(store.missing()).toEqual([]);
    expect(store.canSubmit()).toBe(true);
  });

  it('upload 413 : erreur gardée pour le champ, dossier inchangé', async () => {
    const load = vi.fn().mockResolvedValue(DOSSIER);
    const upload = vi
      .fn()
      .mockReturnValue(throwError(() => ({ status: 413, code: 'DOCUMENT_TOO_LARGE' })));
    const { store } = setup({ load, upload });
    await store.load();
    await expect(store.uploadDocument(INPUT, FILE)).resolves.toBe(false);
    expect(store.upload().status).toBe('error');
    expect(store.upload().problem?.status).toBe(413);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.documents()).toHaveLength(1);
    store.resetUpload();
    expect(store.upload().problem).toBeNull();
  });

  it('remove : 204 puis relecture ; 409 gardé comme erreur de retrait', async () => {
    const load = vi.fn().mockResolvedValue(DOSSIER);
    const remove = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ status: 409, code: 'VERIFICATION_LOCKED' });
    const { store } = setup({ load, remove });
    await store.load();
    await expect(store.remove('d1')).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    await expect(store.remove('d1')).resolves.toBe(false);
    expect(store.removeProblem()?.status).toBe(409);
    expect(store.removing()).toBeNull();
  });

  it('submit : dossier under_review et session relue pour le bandeau', async () => {
    const reviewed: Verification = { ...DOSSIER, status: 'under_review', missing: [] };
    const me = vi.fn().mockResolvedValue({
      id: '1',
      email: 'a@example.test',
      displayName: 'Alix',
      profession: 'psychologist',
      verificationStatus: 'under_review',
      role: 'practitioner',
      twoFactorEnabled: false,
      passwordChangeRequired: false,
    });
    const refreshSession = vi.fn().mockResolvedValue(undefined);
    const { store, session } = setup(
      {
        load: vi.fn().mockResolvedValue(DOSSIER),
        submit: vi.fn().mockResolvedValue(reviewed),
        refreshSession,
      },
      me,
    );
    await store.load();
    await expect(store.submit()).resolves.toBe(true);
    expect(refreshSession).toHaveBeenCalled();
    expect(store.status()).toBe('under_review');
    expect(store.editable()).toBe(false);
    expect(me).toHaveBeenCalled();
    expect(session.verificationStatus()).toBe('under_review');
  });

  it('submit réussi mais session non rafraîchie : le dossier reste soumis, aucun faux échec', async () => {
    const reviewed: Verification = { ...DOSSIER, status: 'under_review', missing: [] };
    const { store } = setup({
      load: vi.fn().mockResolvedValue(DOSSIER),
      submit: vi.fn().mockResolvedValue(reviewed),
      refreshSession: vi.fn().mockRejectedValue({ status: 429, code: 'RATE_LIMITED' }),
    });
    await store.load();
    await expect(store.submit()).resolves.toBe(true);
    expect(store.status()).toBe('under_review');
    expect(store.submission()).toEqual({ status: 'idle', problem: null });
  });

  it('submit 409 VERIFICATION_INCOMPLETE : problème gardé avec missing[]', async () => {
    const { store } = setup({
      load: vi.fn().mockResolvedValue(DOSSIER),
      submit: vi.fn().mockRejectedValue({
        status: 409,
        code: 'VERIFICATION_INCOMPLETE',
        extra: { missing: ['identity'] },
      }),
    });
    await store.load();
    await expect(store.submit()).resolves.toBe(false);
    expect(store.submission().problem?.extra?.['missing']).toEqual(['identity']);
  });

  it('saveInfo : la réponse remplace les informations du dossier', async () => {
    const updateInfo = vi.fn().mockResolvedValue({
      professionalNumber: '829300123',
      phone: '+33600000099',
      remoteOnly: false,
      address: { street: '1 rue A', postalCode: '69001', city: 'Lyon' },
    });
    const { store } = setup({ load: vi.fn().mockResolvedValue(DOSSIER), updateInfo });
    await store.load();
    await expect(store.saveInfo({ professionalNumber: '829300123' })).resolves.toBe(true);
    expect(updateInfo).toHaveBeenCalledWith({ professionalNumber: '829300123' });
    expect(store.verification()?.professionalInfo.address.city).toBe('Lyon');
    expect(store.info().savedAt).not.toBeNull();
  });

  it('documentUrl : null sur erreur', async () => {
    const { store } = setup({
      documentUrl: vi.fn().mockRejectedValue({ status: 410, code: 'DOCUMENT_PURGED' }),
    });
    await expect(store.documentUrl('d1')).resolves.toBeNull();
  });

  it('api upload : of() synchrone sans progression fonctionne aussi', async () => {
    const { store } = setup({
      load: vi.fn().mockResolvedValue(DOSSIER),
      upload: vi.fn().mockReturnValue(of({ kind: 'done', document: DOSSIER.documents[0] })),
    });
    await expect(store.uploadDocument(INPUT, FILE)).resolves.toBe(true);
  });
});
