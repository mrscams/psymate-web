import { Verification } from './verification.api';

/** Jeu de données des specs du dossier professionnel (store et page). */
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
