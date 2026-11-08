import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ShellTab } from '../data/patient-shell.model';
import { PatientShellStore } from '../data/patient-shell.store';
import { tabLabel } from '../ui/shell-labels';

/** Ce que la page provisoire range dans la mémoire des onglets. */
export interface PlaceholderTabState {
  count: number;
}

/**
 * Onglet provisoire du dossier (M1-07) : overview, timeline, graph et search en attendant leurs
 * tâches (M4-05, M3-02, M2-06, M4-08), qui remplacent chacune sa route. Le compteur démontre la
 * mémoire des onglets : il est rangé par rememberTab et relu par recallTab au retour (B2).
 */
@Component({
  selector: 'pm-tab-placeholder-page',
  imports: [RouterLink],
  template: `
    <section class="placeholder" [attr.aria-labelledby]="headingId()">
      <h2 [id]="headingId()">{{ title() }}</h2>
      <p i18n="Texte d'un onglet provisoire du dossier@@patientShell.placeholder.text">
        Cet onglet s'affichera ici.
      </p>
      <p class="actions">
        <button type="button" class="counter" (click)="increment()">
          <span i18n="Compteur d'un onglet provisoire@@patientShell.placeholder.counter"
            >Compteur : {{ count() }}</span
          >
        </button>
        @if (tab() === 'overview') {
          <a
            [routerLink]="['/patients', store.patientId(), 'fiche']"
            i18n="Lien vers la fiche depuis le dossier@@patientShell.placeholder.sheetLink"
            >Modifier la fiche</a
          >
        }
      </p>
    </section>
  `,
  styles: `
    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-large);
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .counter {
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .counter:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    a {
      color: var(--primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabPlaceholderPage implements OnInit {
  /** data.tab de la route (withComponentInputBinding). */
  readonly tab = input.required<ShellTab>();

  protected readonly store = inject(PatientShellStore);
  protected readonly title = computed(() => tabLabel(this.tab()));
  protected readonly headingId = computed(() => `tab-${this.tab()}-heading`);

  /** Relu à chaque visite : la valeur laissée au départ précédent, 0 la première fois. */
  protected readonly count = signal(0);

  ngOnInit(): void {
    this.count.set(this.store.recallTab<PlaceholderTabState>(this.tab())?.count ?? 0);
  }

  protected increment(): void {
    this.count.update((n) => n + 1);
    this.store.rememberTab<PlaceholderTabState>(this.tab(), { count: this.count() });
  }
}
