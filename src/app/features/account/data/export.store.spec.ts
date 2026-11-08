import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { DataExportApi } from './data-export.api';
import {
  EXPORT_USER,
  JOB_DONE,
  JOB_FAILED,
  JOB_QUEUED,
  JOB_RUNNING,
  PATIENT_OPTIONS,
} from './data-export.fixtures';
import { EXPORT_JOB_STORAGE_KEY, ExportStore } from './export.store';

const IN_PROGRESS = { status: 409, code: 'EXPORT_IN_PROGRESS' };
const NOT_FOUND = { status: 404, code: 'EXPORT_NOT_FOUND' };
const EXPIRED = { status: 410, code: 'UNKNOWN_ERROR' };

function setup(api: Partial<DataExportApi>) {
  TestBed.configureTestingModule({
    providers: [
      ExportStore,
      { provide: DataExportApi, useValue: api },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(EXPORT_USER) } },
    ],
  });
  TestBed.inject(SessionStore).signIn(EXPORT_USER);
  return TestBed.inject(ExportStore);
}

function remember(jobId: string, owner = 'user-1'): void {
  localStorage.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify({ jobId, owner }));
}

function stored(): unknown {
  const raw = localStorage.getItem(EXPORT_JOB_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('ExportStore · export du compte', () => {
  beforeEach(() => localStorage.clear());

  it('launchExport : 202 → seul l’id du job est mémorisé (localStorage), état relu « en attente »', async () => {
    const requestExport = vi.fn().mockResolvedValue('job-1');
    const exportStatus = vi.fn().mockResolvedValue(JOB_QUEUED);
    const store = setup({ requestExport, exportStatus });

    await expect(store.launchExport()).resolves.toBe(true);

    expect(exportStatus).toHaveBeenCalledWith('job-1');
    expect(stored()).toEqual({ jobId: 'job-1', owner: 'user-1' });
    expect(store.jobKind()).toBe('queued');
    expect(store.jobPending()).toBe(true);
    expect(store.launchBlocked()).toBe(true);
  });

  it('états du job : queued → running → done (lien) → prêt ; done sans lien → expiré ; failed', async () => {
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce(JOB_QUEUED)
      .mockResolvedValueOnce(JOB_RUNNING)
      .mockResolvedValueOnce(JOB_DONE)
      .mockResolvedValueOnce({ ...JOB_DONE, downloadUrl: null })
      .mockResolvedValueOnce(JOB_FAILED);
    const store = setup({ requestExport: vi.fn().mockResolvedValue('job-1'), exportStatus });

    await store.launchExport();
    expect(store.jobKind()).toBe('queued');
    await store.refreshJob();
    expect(store.jobKind()).toBe('running');
    expect(store.launchBlocked()).toBe(true);
    await store.refreshJob();
    expect(store.jobKind()).toBe('ready');
    expect(store.launchBlocked()).toBe(false);
    await store.refreshJob();
    expect(store.jobKind()).toBe('expired');
    await store.refreshJob();
    expect(store.jobKind()).toBe('failed');
    expect(store.job().data?.error).toBe('PDF_RENDER_FAILED');
  });

  it('restoreJob : reprend l’id mémorisé et relit l’état', async () => {
    const exportStatus = vi.fn().mockResolvedValue(JOB_DONE);
    remember('job-1');
    const store = setup({ exportStatus });

    await store.restoreJob();

    expect(exportStatus).toHaveBeenCalledWith('job-1');
    expect(store.jobId()).toBe('job-1');
    expect(store.jobKind()).toBe('ready');
  });

  it('restoreJob : rien de mémorisé → aucun appel, ligne absente', async () => {
    const exportStatus = vi.fn();
    const store = setup({ exportStatus });
    await store.restoreJob();
    expect(exportStatus).not.toHaveBeenCalled();
    expect(store.jobId()).toBeNull();
    expect(store.jobKind()).toBe('none');
  });

  it('restoreJob : id d’un autre compte du navigateur ignoré et effacé', async () => {
    const exportStatus = vi.fn();
    remember('job-9', 'other');
    const store = setup({ exportStatus });
    await store.restoreJob();
    expect(exportStatus).not.toHaveBeenCalled();
    expect(stored()).toBeNull();
  });

  it('404 EXPORT_NOT_FOUND sur l’id mémorisé : l’id est oublié, la ligne disparaît', async () => {
    remember('job-1');
    const store = setup({ exportStatus: vi.fn().mockRejectedValue(NOT_FOUND) });

    await store.restoreJob();

    expect(store.jobId()).toBeNull();
    expect(stored()).toBeNull();
    expect(store.job().status).toBe('idle');
    expect(store.jobKind()).toBe('none');
  });

  it('erreur de lecture (503) : l’id reste, le bloc passe en erreur en gardant la donnée précédente', async () => {
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce(JOB_RUNNING)
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    remember('job-1');
    const store = setup({ exportStatus });

    await store.restoreJob();
    await store.refreshJob();

    expect(store.job().status).toBe('error');
    expect(store.job().data).toEqual(JOB_RUNNING);
    expect(stored()).toEqual({ jobId: 'job-1', owner: 'user-1' });
  });

  it('409 EXPORT_IN_PROGRESS, job inconnu : erreur gardée, bouton en attente jusqu’à clearConflict', async () => {
    const store = setup({ requestExport: vi.fn().mockRejectedValue(IN_PROGRESS) });

    await expect(store.launchExport()).resolves.toBe(false);

    expect(store.launch()).toEqual({ status: 'error', problem: IN_PROGRESS });
    expect(store.conflict()).toBe(true);
    expect(store.launchBlocked()).toBe(true);
    store.clearConflict();
    expect(store.launchBlocked()).toBe(false);
  });

  it('409 EXPORT_IN_PROGRESS, job connu (autre onglet) : le job courant est relu et affiché', async () => {
    const exportStatus = vi.fn().mockResolvedValue(JOB_RUNNING);
    const store = setup({ requestExport: vi.fn().mockRejectedValue(IN_PROGRESS), exportStatus });
    remember('job-1');

    await store.launchExport();

    expect(exportStatus).toHaveBeenCalledWith('job-1');
    expect(store.jobKind()).toBe('running');
    expect(store.conflict()).toBe(false);
    expect(store.launchBlocked()).toBe(true);
  });

  it('downloadArchive : passe la downloadUrl signée au service et rend le fichier', async () => {
    const file = { blob: new Blob(['zip']), fileName: 'export-psymate-20261107.zip' };
    const downloadExport = vi.fn().mockResolvedValue(file);
    remember('job-1');
    const store = setup({ exportStatus: vi.fn().mockResolvedValue(JOB_DONE), downloadExport });
    await store.restoreJob();

    await expect(store.downloadArchive()).resolves.toBe(file);
    expect(downloadExport).toHaveBeenCalledWith('job-1', JOB_DONE.downloadUrl);
    expect(store.download().status).toBe('idle');
  });

  it('410 au téléchargement : la ligne passe « Expiré » sans erreur bloquante ; Relancer repart', async () => {
    remember('job-1');
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce(JOB_DONE)
      .mockResolvedValueOnce({ ...JOB_QUEUED, jobId: 'job-2' });
    const store = setup({
      exportStatus,
      downloadExport: vi.fn().mockRejectedValue(EXPIRED),
      requestExport: vi.fn().mockResolvedValue('job-2'),
    });
    await store.restoreJob();

    await expect(store.downloadArchive()).resolves.toBeNull();
    expect(store.jobKind()).toBe('expired');
    expect(store.download().status).toBe('expired');
    expect(store.job().data?.downloadUrl).toBeNull();
    expect(store.launchBlocked()).toBe(false);

    await store.launchExport();
    expect(store.jobKind()).toBe('queued');
    expect(stored()).toEqual({ jobId: 'job-2', owner: 'user-1' });
  });

  it('403 au téléchargement (lien signé refusé) : l’état du job est relu', async () => {
    remember('job-1');
    const exportStatus = vi.fn().mockResolvedValue(JOB_DONE);
    const store = setup({
      exportStatus,
      downloadExport: vi.fn().mockRejectedValue({ status: 403, code: 'UNKNOWN_ERROR' }),
    });
    await store.restoreJob();
    await store.downloadArchive();
    expect(exportStatus).toHaveBeenCalledTimes(2);
    expect(store.download().problem?.status).toBe(403);
    expect(store.jobKind()).toBe('ready');
  });

  it('réponse d’état arrivée après un changement de job : ignorée', async () => {
    remember('job-1');
    let resolveOld: (value: typeof JOB_DONE) => void = () => undefined;
    const exportStatus = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ ...JOB_QUEUED, jobId: 'job-2' });
    const store = setup({ exportStatus, requestExport: vi.fn().mockResolvedValue('job-2') });

    const restoring = store.restoreJob();
    await store.launchExport();
    resolveOld(JOB_DONE);
    await restoring;

    expect(store.jobId()).toBe('job-2');
    expect(store.job().data?.jobId).toBe('job-2');
    expect(store.jobKind()).toBe('queued');
  });

  it('autre erreur au téléchargement : la ligne reste « Prêt », erreur non bloquante', async () => {
    remember('job-1');
    const store = setup({
      exportStatus: vi.fn().mockResolvedValue(JOB_DONE),
      downloadExport: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
    });
    await store.restoreJob();
    await store.downloadArchive();
    expect(store.jobKind()).toBe('ready');
    expect(store.download().status).toBe('error');
  });
});

describe('ExportStore · export d’un patient', () => {
  beforeEach(() => localStorage.clear());

  it('patientsReady : vrai dès qu’une recherche rend un patient, et le reste ensuite', async () => {
    const searchPatients = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(PATIENT_OPTIONS)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    const store = setup({ searchPatients });

    await store.searchPatients('');
    expect(store.patientsReady()).toBe(false);
    await store.searchPatients('mar');
    expect(store.patientsReady()).toBe(true);
    await store.searchPatients('zzz');
    expect(store.patientsReady()).toBe(true);
    await store.searchPatients('');
    expect(store.patientsReady()).toBe(true);
    expect(store.patients().status).toBe('error');
  });

  it('searchPatients : la réponse la plus récente gagne', async () => {
    let resolveFirst: (value: typeof PATIENT_OPTIONS) => void = () => undefined;
    const searchPatients = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([PATIENT_OPTIONS[2]]);
    const store = setup({ searchPatients });

    const first = store.searchPatients('mar');
    await store.searchPatients('paul');
    resolveFirst(PATIENT_OPTIONS);
    await first;

    expect(store.query()).toBe('paul');
    expect(store.patients().data).toEqual([PATIENT_OPTIONS[2]]);
  });

  it('exportPatient : rend le fichier ; 403 → problème gardé pour l’écran', async () => {
    const file = { blob: new Blob(['%PDF']), fileName: 'export-marie-d-20261107.pdf' };
    const exportPatient = vi
      .fn()
      .mockResolvedValueOnce(file)
      .mockRejectedValueOnce({ status: 403, code: 'UNKNOWN_ERROR' });
    const store = setup({ exportPatient });

    await expect(store.exportPatient('p-1', 'pdf')).resolves.toBe(file);
    expect(exportPatient).toHaveBeenCalledWith('p-1', 'pdf');
    expect(store.patientExport().status).toBe('idle');

    await expect(store.exportPatient('p-1', 'md')).resolves.toBeNull();
    expect(store.patientExport().problem?.status).toBe(403);
  });
});
