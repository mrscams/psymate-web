import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { ageInYears, formatMonthYear } from '../../../core/i18n';
import { monthToDate, PatientFlagView } from '../data/patient.model';
import { PatientFlagsComponent } from './patient-flags.component';

/**
 * Aperçu de l'en-tête patient (fiche 16, colonne latérale, maquette 16) : nom, âge, « suivi·e
 * depuis », drapeaux, tels que l'en-tête permanent les affichera, dans un encart qui explique d'où
 * viennent l'âge et la durée du suivi. Mis à jour en direct depuis la saisie.
 */
@Component({
  selector: 'pm-header-preview',
  imports: [PatientFlagsComponent],
  template: `
    <section class="preview" aria-labelledby="header-preview-title">
      <h2 id="header-preview-title" i18n="Titre de l'aperçu de l'en-tête@@patients.preview.title">
        Aperçu de l'en-tête
      </h2>
      <div class="box">
        @if (name()) {
          <p class="name">{{ name() }}</p>
        } @else {
          <p class="name placeholder" i18n="Aperçu sans nom@@patients.preview.noName">
            Nom affiché
          </p>
        }
        @if (meta()) {
          <p class="meta">{{ meta() }}</p>
        }
        <pm-patient-flags [flags]="flags()" />
      </div>
      <p class="note" i18n="Explication de l'aperçu de l'en-tête@@patients.preview.note">
        L'âge est calculé depuis la date de naissance ; « suivi·e depuis » depuis la date de début
        du suivi.
      </p>
    </section>
  `,
  styles: `
    .preview {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 20px 20px;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--surface-raised);
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-label-large);
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-ground);
    }
    .name {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--text-primary);
      overflow-wrap: anywhere;
    }
    .placeholder {
      color: var(--text-secondary);
    }
    .meta,
    .note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderPreviewComponent {
  readonly displayName = input('');
  readonly birthDate = input('');
  /** Mois AAAA-MM de « suivi·e depuis ». */
  readonly since = input('');
  readonly flags = input<PatientFlagView[]>([]);

  private readonly locale = inject(LOCALE_ID);

  protected readonly name = computed(() => this.displayName().trim());

  protected readonly meta = computed(() => {
    const parts: string[] = [];
    const age = ageInYears(this.birthDate() || null);
    if (age !== null) {
      parts.push($localize`:Âge dans l'aperçu de l'en-tête@@patients.preview.age:${age}:age: ans`);
    }
    const since = this.since()
      ? formatMonthYear(monthToDate(this.since()), this.locale, 'UTC')
      : '';
    if (since) {
      parts.push(
        $localize`:Début du suivi dans l'aperçu@@patients.preview.since:suivi·e depuis ${since}:since:`,
      );
    }
    return parts.join(' · ');
  });
}
