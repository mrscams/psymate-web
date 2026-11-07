import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * /patients provisoire (M0-07) : la route protégée où mène la connexion. La liste des patients
 * (fiche 01) la remplace en M1-06.
 */
@Component({
  selector: 'pm-patient-list-page',
  template: `
    <h1 i18n="Titre de la liste des patients@@patients.list.title">Mes patients</h1>
    <p i18n="Texte provisoire de la liste des patients@@patients.list.placeholder">
      La liste de vos patients s'affichera ici.
    </p>
  `,
  styles: `
    h1 {
      margin-top: 0;
      font: var(--mat-sys-headline-small);
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientListPage {}
