import { SessionUser } from '../../../core/auth';
import { ExportStatus, PatientOption } from './data-export.api';

/** Données de test de « Données et export » (fiche 19) : jamais de vraies données cliniques. */
export const EXPORT_USER: SessionUser = {
  id: 'user-1',
  email: 'claire@example.test',
  displayName: 'Claire Martin',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

export const PATIENT_OPTIONS: PatientOption[] = [
  { id: 'p-1', displayName: 'Marie D.', birthDate: '1992-04-12', archived: false },
  { id: 'p-2', displayName: 'Marius D.', birthDate: null, archived: false },
  { id: 'p-3', displayName: 'Paul R.', birthDate: null, archived: true },
];

export const JOB_QUEUED: ExportStatus = {
  jobId: 'job-1',
  status: 'queued',
  requestedAt: '2026-11-07T10:00:00Z',
  finishedAt: null,
  expiresAt: null,
  downloadUrl: null,
  error: null,
};

export const JOB_RUNNING: ExportStatus = { ...JOB_QUEUED, status: 'running' };

export const JOB_DONE: ExportStatus = {
  ...JOB_QUEUED,
  status: 'done',
  finishedAt: '2026-11-07T10:01:00Z',
  expiresAt: '2026-11-14T10:01:00Z',
  downloadUrl: '/api/me/export/job-1/file?exp=1794000060&sig=abc',
};

export const JOB_FAILED: ExportStatus = {
  ...JOB_QUEUED,
  status: 'failed',
  finishedAt: '2026-11-07T10:01:00Z',
  error: 'PDF_RENDER_FAILED',
};
