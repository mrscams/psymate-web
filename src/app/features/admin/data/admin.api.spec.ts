import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { AdminApi } from './admin.api';

// Le client généré n'est importé que par admin.api.ts : ici, on observe les requêtes HTTP réelles.
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
  });
  return { api: TestBed.inject(AdminApi), http: TestBed.inject(HttpTestingController) };
}

describe('AdminApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('decide : complément sans message envoyé tel quel (le serveur répond 422), note retirée si vide', async () => {
    const { api, http } = setup();
    const pending = api.decide('p1', {
      kind: 'needs_more',
      internalNote: '  ',
      messageToPractitioner: '   ',
      checklist: { nameMatches: true },
      force: false,
    });
    const req = http.expectOne('/api/admin/verifications/p1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'needs_more',
      checklist: { nameMatches: true },
      messageToPractitioner: '',
    });
    req.flush({}, { status: 201, statusText: 'Created' });
    await pending;
  });

  it('decide : approbation forcée avec note interne, sans message', async () => {
    const { api, http } = setup();
    const pending = api.decide('p1', {
      kind: 'approved',
      internalNote: ' Pièces vérifiées au téléphone. ',
      messageToPractitioner: '',
      checklist: {},
      force: true,
    });
    const req = http.expectOne('/api/admin/verifications/p1/decision');
    expect(req.request.body).toEqual({
      kind: 'approved',
      checklist: {},
      internalNote: 'Pièces vérifiées au téléphone.',
      force: true,
    });
    req.flush({});
    await pending;
  });

  it('documentFile : exp et sig repris de l’URL signée, réponse en blob', async () => {
    const { api, http } = setup();
    const pending = api.documentFile('p1', 'd1', {
      url: '/api/admin/verifications/p1/documents/d1/file?exp=1794095287&sig=Mf_T-n',
      expiresAt: null,
    });
    const req = http.expectOne((r) => r.url === '/api/admin/verifications/p1/documents/d1/file');
    expect(req.request.params.get('exp')).toBe('1794095287');
    expect(req.request.params.get('sig')).toBe('Mf_T-n');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']));
    expect(await pending).toBeInstanceOf(Blob);
  });

  it('accounts : compteurs complétés à 0, recherche vide non envoyée', async () => {
    const { api, http } = setup();
    const pending = api.accounts({
      q: '  ',
      status: null,
      role: 'admin',
      profession: null,
      cursor: null,
    });
    const req = http.expectOne((r) => r.url === '/api/admin/practitioners');
    expect(req.request.params.keys().sort()).toEqual(['limit', 'role']);
    expect(req.request.params.get('role')).toBe('admin');
    req.flush({ items: [], nextCursor: null, counts: { approved: 4 } });
    expect((await pending).counts).toEqual({
      approved: 4,
      under_review: 0,
      needs_more: 0,
      suspended: 0,
      rejected: 0,
    });
  });

  it('createEntry : libellé anglais vide non envoyé, blancs de bord retirés', async () => {
    const { api, http } = setup();
    const pending = api.createEntry({
      kind: 'specialty',
      code: ' sleep ',
      labelFr: ' Sommeil ',
      labelEn: ' ',
    });
    const req = http.expectOne('/api/admin/vocabulary/directory');
    expect(req.request.body).toEqual({ kind: 'specialty', code: 'sleep', labelFr: 'Sommeil' });
    req.flush({ kind: 'specialty', code: 'sleep', labelFr: 'Sommeil', active: true });
    expect((await pending).labelEn).toBeNull();
  });

  it('M16-25 createEntry : libellé arabe envoyé sans blancs de bord, relu dans la réponse', async () => {
    const { api, http } = setup();
    const pending = api.createEntry({
      kind: 'specialty',
      code: 'sleep_disorders',
      labelFr: 'Troubles du sommeil',
      labelEn: 'Sleep disorders',
      labelAr: ' اضطرابات النوم ',
    });
    const req = http.expectOne('/api/admin/vocabulary/directory');
    expect(req.request.body).toEqual({
      kind: 'specialty',
      code: 'sleep_disorders',
      labelFr: 'Troubles du sommeil',
      labelEn: 'Sleep disorders',
      labelAr: 'اضطرابات النوم',
    });
    req.flush({ ...req.request.body, active: true, sortOrder: 0, usedByPublishedProfiles: 0 });
    expect((await pending).labelAr).toBe('اضطرابات النوم');
  });

  it('M16-25 createEntry : libellé arabe vide non envoyé, null à la lecture', async () => {
    const { api, http } = setup();
    const pending = api.createEntry({
      kind: 'audience',
      code: 'seniors',
      labelFr: 'Seniors',
      labelAr: '  ',
    });
    const req = http.expectOne('/api/admin/vocabulary/directory');
    expect(req.request.body).toEqual({ kind: 'audience', code: 'seniors', labelFr: 'Seniors' });
    req.flush({ kind: 'audience', code: 'seniors', labelFr: 'Seniors', active: true });
    expect((await pending).labelAr).toBeNull();
  });

  it('M16-25 patchEntry : labelAr transmis tel quel (vide = effacé)', async () => {
    const { api, http } = setup();
    const pending = api.patchEntry('specialty', 'anxiety', { labelAr: '' });
    const req = http.expectOne('/api/admin/vocabulary/directory/specialty/anxiety');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ labelAr: '' });
    req.flush({ kind: 'specialty', code: 'anxiety', labelFr: 'Anxiété' });
    expect((await pending).labelAr).toBeNull();
  });

  it('M16-25 vocabulary et fixedVocabulary : labelAr porté, null s’il manque', async () => {
    const { api, http } = setup();
    const entries = api.vocabulary();
    http.expectOne('/api/admin/vocabulary/directory').flush({
      items: [
        { kind: 'specialty', code: 'anxiety', labelFr: 'Anxiété', labelAr: 'القلق' },
        { kind: 'specialty', code: 'grief', labelFr: 'Deuil' },
      ],
    });
    expect((await entries).map((entry) => entry.labelAr)).toEqual(['القلق', null]);

    const fixed = api.fixedVocabulary();
    http.expectOne('/api/public/directory/vocabulary').flush({
      modalities: [
        { code: 'video', labelFr: 'En visio', labelEn: 'Video', labelAr: 'عبر الفيديو' },
      ],
      languages: [{ code: 'fr', labelFr: 'Français' }],
    });
    const lists = await fixed;
    expect(lists.modalities[0].labelAr).toBe('عبر الفيديو');
    expect(lists.languages[0].labelAr).toBeNull();
  });

  it('journal : filtres transmis, curseur tel quel', async () => {
    const { api, http } = setup();
    const pending = api.journal({
      kind: 'admin',
      actorId: null,
      practitionerId: 'p1',
      from: '2026-11-01',
      to: null,
      cursor: 'abc',
    });
    const req = http.expectOne((r) => r.url === '/api/admin/journal');
    expect(req.request.params.get('kind')).toBe('admin');
    expect(req.request.params.get('practitionerId')).toBe('p1');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(req.request.params.get('cursor')).toBe('abc');
    expect(req.request.params.has('actorId')).toBe(false);
    req.flush({
      items: [{ id: 'j1', at: '2026-11-07T10:00:00Z', kind: 'login_ok' }],
      nextCursor: null,
    });
    expect((await pending).items[0]).toEqual(
      expect.objectContaining({ id: 'j1', actorType: 'system', summary: 'login_ok' }),
    );
  });
});
