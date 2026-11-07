import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { ageInYears, formatMonthYear } from '../../../core/i18n';
import { initials } from '../../../shared/util';
import { monthToDate, PatientFlagView } from '../data/patient.model';
import { PatientFlagsComponent } from './patient-flags.component';

/**
 * Aperçu de l'en-tête patient (fiche 16, colonne latérale) : nom, âge, « suivi·e depuis »,
 * drapeaux, tels que l'en-tête permanent les affichera. Mis à jour en direct depuis la saisie.
 */
@Component({
  selector: 'pm-header-preview',
  imports: [PatientFlagsComponent],
  template: `
    <section class="preview" aria-labelledby="header-preview-title">
      <h2 id="header-preview-title" i18n="Titre de l'aperçu de l'en-tête@@patients.preview.title">
        Aperçu de l'en-tête
      </h2>
      <div class="card">
        <span class="avatar" aria-hidden="true">{{ initialsText() }}</span>
        <div class="who">
          @if (name()) {
            <p class="name">{{ name() }}</p>
          } @else {
            <p class="name placeholder" i18n="Aperçu sans nom@@patients.preview.noName">
              Nom affiché
            </p>
          }
          <p class="meta">{{ meta() }}</p>
          <pm-patient-flags [flags]="flags()" />
        </div>
      </div>
    </section>
  `,
  styles: `
    .preview h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-label-large);
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .card {
      display: flex;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--surface-raised);
    }
    .avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: var(--mat-sys-title-small);
    }
    .who {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
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
    .meta {
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
  protected readonly initialsText = computed(() => initials(this.name()));

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
