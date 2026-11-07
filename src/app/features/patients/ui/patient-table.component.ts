import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ageInYears, formatRelativeDay, SubjectLabelPipe } from '../../../core/i18n';
import { initials } from '../../../shared/util';
import { PatientSort, PatientView } from '../data/patient.model';
import { highlightParts } from './highlight';
import { PatientFlagsComponent } from './patient-flags.component';

/** Ligne préparée pour le gabarit. */
interface PatientRow {
  patient: PatientView;
  initials: string;
  name: { text: string; match: boolean }[];
  age: number | null;
  tags: string[];
  moreTags: number;
  changed: string;
  archived: boolean;
}

/**
 * Tableau des patients (fiche 01) : vrai `<table>`, en-têtes `scope="col"`, tri annoncé par
 * `aria-sort`, nom en lien vers le dossier (pas de ligne cliquable en JavaScript), lien « Fiche »
 * par ligne. Les correspondances du filtre sont surlignées sans tenir compte des accents.
 * Colonnes « dernière séance », « tendance » et émotions absentes : la liste du contrat ne les
 * fournit pas.
 */
@Component({
  selector: 'pm-patient-table',
  imports: [RouterLink, PatientFlagsComponent, SubjectLabelPipe],
  templateUrl: './patient-table.component.html',
  styleUrl: './patient-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientTableComponent {
  readonly patients = input.required<PatientView[]>();
  readonly query = input('');
  readonly sort = input<PatientSort>('name');
  /** Rechargement en cours avec la liste précédente affichée : grisée. */
  readonly refreshing = input(false);

  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = computed<PatientRow[]>(() => {
    const now = new Date();
    return this.patients().map((patient) => {
      const labels = patient.tags.map((tag) => tag.label);
      const archived = !!patient.archivedAt;
      const when = archived ? patient.archivedAt : patient.updatedAt;
      return {
        patient,
        initials: initials(patient.displayName),
        name: highlightParts(patient.displayName, this.query()),
        age: ageInYears(patient.birthDate, now),
        tags: labels.slice(0, 2),
        moreTags: Math.max(0, labels.length - 2),
        changed: when ? formatRelativeDay(when, this.locale, now) : '',
        archived,
      };
    });
  });

  protected readonly nameSort = computed(() => (this.sort() === 'name' ? 'ascending' : null));
  protected readonly changedSort = computed(() =>
    this.sort() === 'updated' ? 'descending' : null,
  );

  protected openLabel(name: string): string {
    return $localize`:Lien vers la fiche d'un patient@@patients.table.editLabel:Modifier la fiche de ${name}:name:`;
  }
}
