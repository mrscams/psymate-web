import { TestBed } from '@angular/core/testing';

import { ExportStatus, SuspendedApi } from './suspended.api';
import { EXPORT_JOB_STORAGE_KEY, SuspendedStore } from './suspended.store';

const CREDENTIALS = { email: 'marc@example.test', password: 'Secret-Clinique-2026' };

const QUEUED: ExportStatus = {
  jobId: 'job-1',
  status: 'queued',
  requestedAt: '2026-11-07T10:00:00Z',
  finishedAt: null,
  expiresAt: null,
  downloadUrl: null,
  error: null,
};

const DONE: ExportStatus = {
  ...QUEUED,
  status: 'done',
  finishedAt: '2026-11-07T10:01:00Z',
  expiresAt: '2026-11-14T10:01:00Z',
  downloadUrl: '/api/me/export/job-1/file?exp=1794000060&sig=abc',
};

function setup(api: Partial<SuspendedApi>) {
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [{ provide: SuspendedApi, useValue: api }] });
  return TestBed.inject(SuspendedStore);
}

describe('SuspendedStore · export du compte', () => {
  it('requestExport : 202 { jobId, statusUrl } → job mémorisé (sessionStorage), statut relu', async () => {
    const requestExport = vi
      .fn()
      .mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 'tok' });
    const exportStatus = vi.fn().mockResolvedValue(QUEUED);
    const store = setup({ requestExport, exportStatus });

    await expect(store.requestExport(CREDENTIALS)).resolves.toBe(true);

    expect(requestExport).toHaveBeenCalledWith(CREDENTIALS);
    expect(exportStatus).toHaveBeenCalledWith('job-1', 'tok');
    expect(store.job()).toEqual({ jobId: 'job-1', token: 'tok' });
    expect(JSON.parse(sessionStorage.getItem(EXPORT_JOB_STORAGE_KEY) ?? '{}')).toEqual({
      jobId: 'job-1',
      token: 'tok',
    });
    expect(store.exportKind()).toBe('queued');
    expect(store.exportPending()).toBe(true);
  });

  it('requestExport : 202 { otpRequired } → le champ code s’affiche, aucun job', async () => {
    const store = setup({ requestExport: vi.fn().mockResolvedValue({ kind: 'otp-required' }) });
    await expect(store.requestExport(CREDENTIALS)).resolves.toBe(false);
    expect(store.otpRequired()).toBe(true);
    expect(store.job()).toBeNull();
    expect(store.exportRequest().problem).toBeNull();
  });

  it('requestExport : 409 EXPORT_IN_PROGRESS → problème gardé, pas de verrou', async () => {
    const store = setup({
      requestExport: vi.fn().mockRejectedValue({ status: 409, code: 'EXPORT_IN_PROGRESS' }),
    });
    await expect(store.requestExport(CREDENTIALS)).resolves.toBe(false);
    expect(store.exportRequest().problem?.code).toBe('EXPORT_IN_PROGRESS');
    expect(store.lockedUntil()).toBeNull();
  });

  it('requestExport : 423 → verrou jusqu’à maintenant + retryAfterSeconds', async () => {
    const store = setup({
      requestExport: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 120 }),
    });
    const before = Date.now();
    await store.requestExport(CREDENTIALS);
    expect(store.lockedUntil() ?? 0).toBeGreaterThanOrEqual(before + 120_000);
    store.unlock();
    expect(store.lockedUntil()).toBeNull();
  });

  it('refreshExport : done avec lien → ready ; done sans lien → expired ; failed → failed', async () => {
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce(DONE)
      .mockResolvedValueOnce({ ...DONE, downloadUrl: null })
      .mockResolvedValueOnce({ ...QUEUED, status: 'failed', error: 'disk full' });
    const store = setup({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: null }),
      exportStatus,
    });
    await store.requestExport(CREDENTIALS);
    expect(store.exportKind()).toBe('ready');
    expect(store.exportPending()).toBe(false);
    await store.refreshExport();
    expect(store.exportKind()).toBe('expired');
    await store.refreshExport();
    expect(store.exportKind()).toBe('failed');
    expect(store.exportStatus().data?.error).toBe('disk full');
  });

  it('restore : reprend le job de sessionStorage et réinterroge ; 404 → la ligne disparaît', async () => {
    sessionStorage.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify({ jobId: 'job-9', token: 't9' }));
    const exportStatus = vi.fn().mockRejectedValue({ status: 404, code: 'EXPORT_NOT_FOUND' });
    TestBed.configureTestingModule({
      providers: [{ provide: SuspendedApi, useValue: { exportStatus } }],
    });
    const store = TestBed.inject(SuspendedStore);
    await store.restore();
    expect(exportStatus).toHaveBeenCalledWith('job-9', 't9');
    expect(store.job()).toBeNull();
    expect(store.exportKind()).toBe('none');
    expect(sessionStorage.getItem(EXPORT_JOB_STORAGE_KEY)).toBeNull();
  });

  it('refreshExport : erreur réseau → état erreur, donnée précédente conservée', async () => {
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce(QUEUED)
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const store = setup({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: null }),
      exportStatus,
    });
    await store.requestExport(CREDENTIALS);
    await store.refreshExport();
    expect(store.exportStatus().status).toBe('error');
    expect(store.exportStatus().data?.status).toBe('queued');
  });

  it('downloadExport : le fichier est rendu ; 410 EXPORT_EXPIRED → ligne « expiré » sans erreur bloquante', async () => {
    const file = { blob: new Blob(['zip']), fileName: 'export-psymate-20261107.zip' };
    const downloadExport = vi
      .fn()
      .mockResolvedValueOnce(file)
      .mockRejectedValueOnce({ status: 410, code: 'EXPORT_EXPIRED' });
    const store = setup({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: null }),
      exportStatus: vi.fn().mockResolvedValue(DONE),
      downloadExport,
    });
    await store.requestExport(CREDENTIALS);

    await expect(store.downloadExport()).resolves.toEqual(file);
    expect(downloadExport).toHaveBeenCalledWith('job-1', DONE.downloadUrl);
    expect(store.download().status).toBe('idle');

    await expect(store.downloadExport()).resolves.toBeNull();
    expect(store.download().status).toBe('expired');
    expect(store.exportKind()).toBe('expired');
    expect(store.exportStatus().data?.downloadUrl).toBeNull();

    store.forgetExport();
    expect(store.exportKind()).toBe('none');
    expect(store.job()).toBeNull();
  });

  it('downloadExport : sans lien, rien n’est appelé', async () => {
    const downloadExport = vi.fn();
    const store = setup({ downloadExport });
    await expect(store.downloadExport()).resolves.toBeNull();
    expect(downloadExport).not.toHaveBeenCalled();
  });
});

describe('SuspendedStore · recours', () => {
  it('submitAppeal : 201 → submitted avec la date du dépôt', async () => {
    const submitAppeal = vi
      .fn()
      .mockResolvedValue({ kind: 'submitted', id: 'a1', submittedAt: '2026-11-07T10:05:00Z' });
    const store = setup({ submitAppeal });
    await expect(store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.')).resolves.toBe(
      true,
    );
    expect(submitAppeal).toHaveBeenCalledWith(CREDENTIALS, 'Vingt caractères au moins ici.');
    expect(store.appeal()).toEqual({
      status: 'submitted',
      submittedAt: '2026-11-07T10:05:00Z',
      problem: null,
    });
  });

  it('submitAppeal : 202 otpRequired → champ code, rien d’enregistré', async () => {
    const store = setup({ submitAppeal: vi.fn().mockResolvedValue({ kind: 'otp-required' }) });
    await expect(store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.')).resolves.toBe(
      false,
    );
    expect(store.otpRequired()).toBe(true);
    expect(store.appeal().status).toBe('idle');
  });

  it('submitAppeal : 409 APPEAL_ALREADY_OPEN → closed (« un recours est déjà en cours »)', async () => {
    const store = setup({
      submitAppeal: vi.fn().mockRejectedValue({ status: 409, code: 'APPEAL_ALREADY_OPEN' }),
    });
    await expect(store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.')).resolves.toBe(
      false,
    );
    expect(store.appeal().status).toBe('closed');
    expect(store.appeal().problem?.code).toBe('APPEAL_ALREADY_OPEN');
  });

  it('submitAppeal : 409 ACCOUNT_NOT_SUSPENDED → error (le formulaire reste)', async () => {
    const store = setup({
      submitAppeal: vi.fn().mockRejectedValue({ status: 409, code: 'ACCOUNT_NOT_SUSPENDED' }),
    });
    await store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.');
    expect(store.appeal().status).toBe('error');
  });

  it('submitAppeal : 401 → error ; 423 → verrou', async () => {
    const submitAppeal = vi
      .fn()
      .mockRejectedValueOnce({ status: 401, code: 'INVALID_CREDENTIALS' })
      .mockRejectedValueOnce({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 60 });
    const store = setup({ submitAppeal });
    await store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.');
    expect(store.appeal().status).toBe('error');
    expect(store.appeal().problem?.status).toBe(401);
    expect(store.lockedUntil()).toBeNull();
    await store.submitAppeal(CREDENTIALS, 'Vingt caractères au moins ici.');
    expect(store.lockedUntil()).not.toBeNull();
  });
});
