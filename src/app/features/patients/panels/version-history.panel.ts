import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';

import { SidePanelComponent } from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import { VersionDiff } from '../data/patient.model';
import { VersionHistoryComponent } from '../ui/version-history.component';

/** Données du panneau : signaux du store de la page (le panneau suit les relectures). */
export interface PatientVersionsPanelData {
  /** Nom affiché du patient, sous le titre. */
  name: string;
  history: Signal<VersionDiff[]>;
  state: Signal<StateKind | null>;
  retry: () => void;
}

/**
 * « Historique des versions » de la fiche (proposition 16 : action de l'en-tête de page, plus une
 * carte latérale) : panneau secondaire de 420 px (fiche 00 §6), versions de la plus récente à la
 * plus ancienne, changements champ par champ (pm-version-history, trois états).
 */
@Component({
  selector: 'pm-patient-versions-panel',
  imports: [SidePanelComponent, VersionHistoryComponent],
  template: `
    <pm-side-panel [title]="title" [subtitle]="data.name">
      <pm-version-history
        [history]="data.history()"
        [state]="data.state()"
        (retry)="data.retry()"
      />
    </pm-side-panel>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientVersionsPanel {
  protected readonly data = inject<PatientVersionsPanelData>(DIALOG_DATA);
  protected readonly title = $localize`:Titre du panneau d'historique de la fiche@@patients.history.panelTitle:Historique des versions`;
}
