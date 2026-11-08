import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import {
  AdministrationJournalService,
  AdministrationPraticiensService,
  AdministrationVerificationsService,
  AdministrationVocabulaireDeLannuaireService,
  RecoursService,
  VocabulaireDeLannuaireService,
} from '../../../api';
import { AdminApi } from './admin.api';

function setup(verifications: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AdministrationVerificationsService, useValue: verifications },
      { provide: AdministrationPraticiensService, useValue: extra['practitioners'] ?? {} },
      { provide: RecoursService, useValue: {} },
      { provide: AdministrationJournalService, useValue: extra['journal'] ?? {} },
      { provide: AdministrationVocabulaireDeLannuaireService, useValue: extra['vocabulary'] ?? {} },
      { provide: VocabulaireDeLannuaireService, useValue: {} },
    ],
  });
  return TestBed.inject(AdminApi);
}

describe('AdminApi', () => {
  it('decide : complément sans message envoyé tel quel (le serveur répond 422), note retirée si vide', async () => {
    const decideAdminVerification = vi.fn().mockReturnValue(of({}));
    const api = setup({ decideAdminVerification });
    await api.decide('p1', {
      kind: 'needs_more',
      internalNote: '  ',
      messageToPractitioner: '   ',
      checklist: { nameMatches: true },
      force: false,
    });
    expect(decideAdminVerification).toHaveBeenCalledWith('p1', {
      kind: 'needs_more',
      checklist: { nameMatches: true },
      messageToPractitioner: '',
    });
  });

  it('decide : approbation forcée avec note interne, sans message', async () => {
    const decideAdminVerification = vi.fn().mockReturnValue(of({}));
    const api = setup({ decideAdminVerification });
    await api.decide('p1', {
      kind: 'approved',
      internalNote: ' Pièces vérifiées au téléphone. ',
      messageToPractitioner: '',
      checklist: {},
      force: true,
    });
    expect(decideAdminVerification).toHaveBeenCalledWith('p1', {
      kind: 'approved',
      checklist: {},
      internalNote: 'Pièces vérifiées au téléphone.',
      force: true,
    });
  });

  it('documentFile : exp et sig repris de l’URL signée', async () => {
    const getAdminDocumentFile = vi.fn().mockReturnValue(of(new Blob()));
    const api = setup({ getAdminDocumentFile });
    await api.documentFile('p1', 'd1', {
      url: '/api/admin/verifications/p1/documents/d1/file?exp=1794095287&sig=Mf_T-n',
      expiresAt: null,
    });
    expect(getAdminDocumentFile).toHaveBeenCalledWith('p1', 'd1', 1794095287, 'Mf_T-n');
  });

  it('accounts : compteurs complétés à 0, recherche vide non envoyée', async () => {
    const listAdminPractitioners = vi
      .fn()
      .mockReturnValue(of({ items: [], nextCursor: null, counts: { approved: 4 } }));
    const api = setup({}, { practitioners: { listAdminPractitioners } });
    const page = await api.accounts({
      q: '  ',
      status: null,
      role: 'admin',
      profession: null,
      cursor: null,
    });
    expect(listAdminPractitioners).toHaveBeenCalledWith(
      undefined,
      undefined,
      'admin',
      undefined,
      undefined,
      50,
    );
    expect(page.counts).toEqual({
      approved: 4,
      under_review: 0,
      needs_more: 0,
      suspended: 0,
      rejected: 0,
    });
  });

  it('createEntry : libellé anglais vide non envoyé', async () => {
    const createAdminDirectoryVocabulary = vi
      .fn()
      .mockReturnValue(of({ kind: 'specialty', code: 'sleep', labelFr: 'Sommeil', active: true }));
    const api = setup({}, { vocabulary: { createAdminDirectoryVocabulary } });
    const created = await api.createEntry({
      kind: 'specialty',
      code: ' sleep ',
      labelFr: ' Sommeil ',
      labelEn: ' ',
    });
    expect(createAdminDirectoryVocabulary).toHaveBeenCalledWith({
      kind: 'specialty',
      code: 'sleep',
      labelFr: 'Sommeil',
    });
    expect(created.labelEn).toBeNull();
  });
});
