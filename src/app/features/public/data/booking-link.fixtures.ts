// Jeux de données des tests des pages par lien (fiche 32).
import { PublicAppointment } from './booking.models';

/** Jeudi 26 novembre 2026, 10:00 – 11:00 à Paris (maquette 32), au cabinet, chez Claire Martin. */
export function appointment(patch: Partial<PublicAppointment> = {}): PublicAppointment {
  return {
    status: 'pending',
    cancelledBy: null,
    startsAt: '2026-11-26T09:00:00Z',
    endsAt: '2026-11-26T10:00:00Z',
    durationMin: 60,
    modality: 'in_person',
    practitioner: { slug: 'claire-martin', displayName: 'Claire Martin' },
    canCancel: true,
    manageToken: null,
    ...patch,
  };
}

/** Jeton de démonstration : 43 caractères base64url, comme ceux de l'API. */
export const VERIFY_TOKEN = 'ykxmVbPvDF_IC16HdtVqNLezq6XChcIdBNhFLISxEgI';
export const MANAGE_TOKEN = 'gjyjfr30j7mKXXv-C7oBsQ2I12pZHpOAkAu1JQ_GJu4';
