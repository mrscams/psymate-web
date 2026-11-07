import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';

/** Clé `vocabulary.subjectLabel` des préférences (fiche 14) : « patient » ou « client » (coach). */
export type SubjectLabel = 'patient' | 'client';

/** Formes demandées au pipe : singulier / pluriel, minuscule / capitale initiale. */
export type SubjectForm = 'one' | 'many' | 'One' | 'Many';

/**
 * Désignation de la personne suivie (handbook §9, G : « patient » devient « client » selon la
 * préférence, jamais dans les données saisies). Alimentée par le PreferencesStore (M1-16) ;
 * `patient` par défaut.
 */
@Injectable({ providedIn: 'root' })
export class SubjectVocabulary {
  readonly label = signal<SubjectLabel>('patient');

  set(label: SubjectLabel): void {
    this.label.set(label === 'client' ? 'client' : 'patient');
  }
}

const FORMS: Record<SubjectLabel, Record<SubjectForm, () => string>> = {
  patient: {
    one: () =>
      $localize`:Désignation de la personne suivie, singulier@@subject.patient.one:patient`,
    many: () =>
      $localize`:Désignation de la personne suivie, pluriel@@subject.patient.many:patients`,
    One: () =>
      $localize`:Désignation de la personne suivie, singulier, capitale@@subject.patient.One:Patient`,
    Many: () =>
      $localize`:Désignation de la personne suivie, pluriel, capitale@@subject.patient.Many:Patients`,
  },
  client: {
    one: () =>
      $localize`:Désignation de la personne suivie (coach), singulier@@subject.client.one:client`,
    many: () =>
      $localize`:Désignation de la personne suivie (coach), pluriel@@subject.client.many:clients`,
    One: () =>
      $localize`:Désignation de la personne suivie (coach), singulier, capitale@@subject.client.One:Client`,
    Many: () =>
      $localize`:Désignation de la personne suivie (coach), pluriel, capitale@@subject.client.Many:Clients`,
  },
};

export function subjectLabel(label: SubjectLabel, form: SubjectForm = 'one'): string {
  return FORMS[label][form]();
}

/**
 * `{{ 'one' | subjectLabel }}` → « patient » ou « client » ; formes `one`, `many`, `One`, `Many`.
 * Impur : il relit le signal du vocabulaire à chaque passage de rendu.
 */
@Pipe({ name: 'subjectLabel', pure: false })
export class SubjectLabelPipe implements PipeTransform {
  private readonly vocabulary = inject(SubjectVocabulary);

  transform(form: SubjectForm = 'one'): string {
    return subjectLabel(this.vocabulary.label(), form);
  }
}
