import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin.api';
import { CLAIRE, documentOf, dossierOf } from './admin.fixtures';
import { DecisionInput } from './admin.model';
import { DossierStore } from './dossier.store';

const SIGNED = { url: '/api/admin/x/file?exp=1&sig=abc', expiresAt: '2026-11-08T10:05:00Z' };

function setup(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    providers: [DossierStore, { provide: AdminApi, useValue: api }],
  });
  return TestBed.inject(DossierStore);
}

const decision = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
  kind: 'approved',
  internalNote: '',
  messageToPractitioner: '',
  checklist: {},
  force: false,
  ...overrides,
});

describe('DossierStore', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fichier');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('load : dossier, puis premier justificatif affiché par URL signée et blob', async () => {
    const documentUrl = vi.fn().mockResolvedValue(SIGNED);
    const documentFile = vi.fn().mockResolvedValue(new Blob(['%PDF']));
    const store = setup({
      dossier: vi.fn().mockResolvedValue(dossierOf()),
      documentUrl,
      documentFile,
    });
    await store.load(CLAIRE.practitionerId);
    expect(store.dossier().data?.displayName).toBe('Claire Moreau');
    expect(store.selectedDocumentId()).toBe('doc-diploma');
    expect(documentUrl).toHaveBeenCalledWith(CLAIRE.practitionerId, 'doc-diploma');
    expect(documentFile).toHaveBeenCalledWith(CLAIRE.practitionerId, 'doc-diploma', SIGNED);
    expect(store.viewer().data).toEqual({
      documentId: 'doc-diploma',
      objectUrl: 'blob:fichier',
      signedUrl: SIGNED.url,
      expiresAt: SIGNED.expiresAt,
    });
    expect(store.nonConform()).toBe(2);
  });

  it('404 : état erreur du dossier', async () => {
    const store = setup({
      dossier: vi.fn().mockRejectedValue({ status: 404, code: 'ADMIN_DOSSIER_NOT_FOUND' }),
    });
    await store.load('inconnu');
    expect(store.dossier().status).toBe('error');
    expect(store.dossier().problem?.status).toBe(404);
  });

  it('visionneuse en erreur (410 purgé) sans toucher au dossier', async () => {
    const store = setup({
      dossier: vi.fn().mockResolvedValue(dossierOf()),
      documentUrl: vi.fn().mockRejectedValue({ status: 410, code: 'ADMIN_DOCUMENT_PURGED' }),
    });
    await store.load(CLAIRE.practitionerId);
    expect(store.dossier().status).toBe('loaded');
    expect(store.viewer().problem?.status).toBe(410);
  });

  it('review : PATCH immédiat, la ligne prend l’état du serveur', async () => {
    const reviewDocument = vi.fn().mockResolvedValue(documentOf({ reviewedStatus: 'conform' }));
    const store = setup({
      dossier: vi.fn().mockResolvedValue(dossierOf()),
      documentUrl: vi.fn().mockResolvedValue(SIGNED),
      documentFile: vi.fn().mockResolvedValue(new Blob()),
      reviewDocument,
    });
    await store.load(CLAIRE.practitionerId);
    const pending = store.review('doc-diploma', 'conform');
    expect(store.reviewing()).toEqual(['doc-diploma']);
    await pending;
    expect(reviewDocument).toHaveBeenCalledWith(CLAIRE.practitionerId, 'doc-diploma', 'conform');
    expect(store.documents()[0].reviewedStatus).toBe('conform');
    expect(store.reviewing()).toEqual([]);
    expect(store.nonConform()).toBe(1);
  });

  it('decide : true si enregistrée ; 422 conservé pour l’écran', async () => {
    const decide = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'messageToPractitioner', code: 'MESSAGE_REQUIRED', message: 'Requis.' }],
      });
    const store = setup({
      dossier: vi.fn().mockResolvedValue(dossierOf({ documents: [] })),
      decide,
    });
    await store.load(CLAIRE.practitionerId);
    expect(await store.decide(decision())).toBe(true);
    expect(await store.decide(decision({ kind: 'needs_more' }))).toBe(false);
    expect(store.decisionProblem()?.code).toBe('VALIDATION_FAILED');
    expect(decide).toHaveBeenLastCalledWith(
      CLAIRE.practitionerId,
      expect.objectContaining({ kind: 'needs_more' }),
    );
  });

  it('changer de dossier libère l’URL blob du précédent', async () => {
    const store = setup({
      dossier: vi.fn().mockResolvedValue(dossierOf()),
      documentUrl: vi.fn().mockResolvedValue(SIGNED),
      documentFile: vi.fn().mockResolvedValue(new Blob()),
    });
    await store.load(CLAIRE.practitionerId);
    store.clear();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fichier');
    expect(store.dossier().status).toBe('idle');
  });
});
