import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { ageInYears, formatLocale, formatMonthYear } from '../../../core/i18n';
import { FlagKind, monthToDate, PatientFlagView } from '../data/patient.model';
import { flagLabel } from './patient-labels';

/**
 * Aperçu de l'en-tête patient (proposition 16, haut du rail `.preview`) : nom affiché, « 35 ans ·
 * suivi·e depuis sept. 2026 », drapeaux en puces ambre (libellé seul, la raison pour les lecteurs
 * d'écran), tels que l'en-tête du dossier les affichera. Mis à jour en direct depuis la saisie ; à
 * la création, il se remplit à mesure.
 */
/** Ordre de l'en-tête du dossier (fiche 16 : le risque en premier). */
const HEADER_ORDER: readonly FlagKind[] = ['risk', 'watch', 'shared_care'];

@Component({
  selector: 'pm-header-preview',
  template: `
    <section class="preview" aria-labelledby="header-preview-title">
      <h2 id="header-preview-title" i18n="Titre de l'aperçu de l'en-tête@@patients.preview.title">
        Aperçu de l'en-tête
      </h2>
      @if (name()) {
        <p class="nm" dir="auto">{{ name() }}</p>
      } @else {
        <p class="nm placeholder" i18n="Aperçu sans nom@@patients.preview.noName">Nom affiché</p>
      }
      @if (meta()) {
        <p class="m">{{ meta() }}</p>
      }
      @if (chips().length > 0) {
        <ul class="chips" [attr.aria-label]="flagsLabel">
          @for (chip of chips(); track chip.kind) {
            <li class="chip">
              {{ chip.text }}
              @if (chip.reason) {
                <span class="sr-only"
                  >: <bdi>{{ chip.reason }}</bdi></span
                >
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .preview {
      display: block;
      padding: 14px;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--surface-raised);
      color: var(--text-primary);
    }
    h2 {
      margin: 0 0 6px;
      color: var(--text-secondary);
      font: 400 11.5px/1.4 var(--font-ui);
    }
    p {
      margin: 0;
    }
    .nm {
      font: 650 17px/1.3 var(--font-ui);
      overflow-wrap: anywhere;
    }
    .placeholder {
      color: var(--text-secondary);
    }
    .m {
      margin: 2px 0 0;
      color: var(--text-secondary);
      font: 400 12.5px/1.5 var(--font-ui);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .chip {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--flag-bg);
      color: var(--warning);
      font: 600 12px/1 var(--font-ui);
      white-space: nowrap;

      &::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 2px;
        background: var(--flag);
      }
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

  /** Locale de formatage (Q73) : chiffres latins et calendrier grégorien en arabe. */
  private readonly locale = formatLocale(inject(LOCALE_ID));

  protected readonly flagsLabel = $localize`:Étiquette de la liste des drapeaux d'un patient@@patients.flags.list:Drapeaux`;

  protected readonly name = computed(() => this.displayName().trim());

  protected readonly chips = computed(() =>
    HEADER_ORDER.flatMap((kind) => {
      const flag = this.flags().find((item) => item.kind === kind);
      return flag ? [{ kind, text: flagLabel(kind), reason: flag.reason }] : [];
    }),
  );

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
