import { FormControl, FormGroup } from '@angular/forms';

import { EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import { EntryDraft, EntryVisibility, RailLink, SessionModality } from '../data/entry.model';

/**
 * Formulaire réactif de l'éditeur (état d'écran du panneau). Les noms suivent les champs du contrat
 * pour qu'applyProblem relie chaque errors[].field à son contrôle : `title`, `body`,
 * `feeling.emotionCode`, `feeling.intensity`, `medication.molecule`, `session.modality`,
 * `occurred` (INVALID_TIME racine), `occurred.from`, `occurred.to`, `occurred.label`, `sessionId`,
 * `visibility`, `reason`. `links` porte les liens cochés du rail « Lié à… » (les erreurs
 * `links[i].…` d'un 422 s'affichent sous le rail, pas sur un contrôle). Aucune règle métier ici : le serveur juge (le client vérifie la forme).
 */
export type OccurredForm = FormGroup<{
  now: FormControl<boolean>;
  precision: FormControl<OccurredPrecision>;
  from: FormControl<string>;
  to: FormControl<string>;
  label: FormControl<string>;
  ongoing: FormControl<boolean>;
}>;

export type EntryForm = FormGroup<{
  type: FormControl<EntryType>;
  title: FormControl<string>;
  body: FormControl<string>;
  feeling: FormGroup<{
    emotionCode: FormControl<string | null>;
    intensity: FormControl<number | null>;
  }>;
  medication: FormGroup<{
    molecule: FormControl<string>;
    dosage: FormControl<string>;
  }>;
  session: FormGroup<{
    modality: FormControl<SessionModality | null>;
    durationMin: FormControl<number | null>;
  }>;
  occurred: OccurredForm;
  sessionId: FormControl<string>;
  visibility: FormControl<EntryVisibility>;
  tags: FormControl<string[]>;
  reason: FormControl<string>;
  links: FormControl<RailLink[]>;
}>;

const text = (value: string): FormControl<string> => new FormControl(value, { nonNullable: true });

export function buildEntryForm(draft: EntryDraft): EntryForm {
  return new FormGroup({
    type: new FormControl<EntryType>(draft.type, { nonNullable: true }),
    title: text(draft.title),
    body: text(draft.body),
    feeling: new FormGroup({
      emotionCode: new FormControl<string | null>(draft.feeling.emotionCode),
      intensity: new FormControl<number | null>(draft.feeling.intensity),
    }),
    medication: new FormGroup({
      molecule: text(draft.medication.molecule),
      dosage: text(draft.medication.dosage),
    }),
    session: new FormGroup({
      modality: new FormControl<SessionModality | null>(draft.session.modality),
      durationMin: new FormControl<number | null>(draft.session.durationMin),
    }),
    occurred: new FormGroup({
      now: new FormControl(draft.occurred.now, { nonNullable: true }),
      precision: new FormControl<OccurredPrecision>(draft.occurred.precision, {
        nonNullable: true,
      }),
      from: text(draft.occurred.from),
      to: text(draft.occurred.to),
      label: text(draft.occurred.label),
      ongoing: new FormControl(draft.occurred.ongoing, { nonNullable: true }),
    }),
    sessionId: text(draft.sessionId),
    visibility: new FormControl<EntryVisibility>(draft.visibility, { nonNullable: true }),
    tags: new FormControl<string[]>([...draft.tags], { nonNullable: true }),
    reason: text(draft.reason),
    links: new FormControl<RailLink[]>([...(draft.links ?? [])], { nonNullable: true }),
  });
}

/** La saisie (contrôles désactivés compris : le type verrouillé en correction). */
export function formDraft(form: EntryForm): EntryDraft {
  const value = form.getRawValue();
  const duration = value.session.durationMin;
  return {
    ...value,
    // pm-date-field et pm-month-field rendent null pour un champ vide : le brouillon garde ''.
    occurred: { ...value.occurred, from: value.occurred.from ?? '', to: value.occurred.to ?? '' },
    session: {
      modality: value.session.modality,
      durationMin: duration === null || (duration as unknown) === '' ? null : Number(duration),
    },
    tags: [...value.tags],
    links: [...value.links],
  };
}
