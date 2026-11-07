import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { globalShortcuts } from '../core/shortcuts';
import { SidePanelComponent, SidePanelService } from '../shared/ui';

/** Contenu de démonstration d'un panneau d'édition (480 px) qui peut ouvrir un second panneau. */
@Component({
  selector: 'pm-demo-entry-panel',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, SidePanelComponent],
  template: `
    <pm-side-panel [title]="data.title">
      <p class="hint">
        Panneau de démonstration : piège de focus, Échap ferme, le focus revient au bouton.
      </p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Titre</mat-label>
        <input matInput type="text" autocomplete="off" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Texte</mat-label>
        <textarea matInput rows="3"></textarea>
      </mat-form-field>
      <button mat-stroked-button type="button" class="open-link" (click)="openLink()">
        Lier <kbd>L</kbd>
      </button>
      <button pmPanelFooter mat-flat-button type="button" class="save">
        Enregistrer <kbd>⏎</kbd>
      </button>
    </pm-side-panel>
  `,
  styles: `
    .hint {
      margin: 0 0 16px;
      color: var(--text-secondary);
    }
    .field {
      display: block;
    }
    kbd {
      margin-left: 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoEntryPanelComponent {
  readonly data = inject<{ title: string }>(DIALOG_DATA);
  private readonly panels = inject(SidePanelService);

  openLink(): void {
    this.panels.open(DemoLinkPanelComponent, {
      data: { title: 'Nouveau lien' },
      width: 420,
      stack: true,
    });
  }
}

/** Second panneau (420 px), empilé sur le premier. */
@Component({
  selector: 'pm-demo-link-panel',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, SidePanelComponent],
  template: `
    <pm-side-panel [title]="data.title">
      <mat-form-field appearance="outline" class="field">
        <mat-label>Entrée à lier</mat-label>
        <input matInput type="text" autocomplete="off" />
      </mat-form-field>
      <button pmPanelFooter mat-flat-button type="button">Créer le lien</button>
    </pm-side-panel>
  `,
  styles: `
    .field {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoLinkPanelComponent {
  readonly data = inject<{ title: string }>(DIALOG_DATA);
}

/** Aide des raccourcis (planche 29 §6), ouverte par `?`. */
@Component({
  selector: 'pm-demo-help-panel',
  imports: [SidePanelComponent],
  template: `
    <pm-side-panel [title]="title">
      <dl class="shortcuts">
        @for (shortcut of shortcuts; track shortcut.key) {
          <dt>
            <kbd>{{ shortcut.display }}</kbd>
          </dt>
          <dd>{{ shortcut.label }}</dd>
        }
      </dl>
    </pm-side-panel>
  `,
  styles: `
    .shortcuts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dd {
      margin: 0;
      color: var(--text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoHelpPanelComponent {
  readonly title = $localize`:Titre du panneau d'aide des raccourcis@@shortcuts.help.title:Raccourcis clavier`;
  readonly shortcuts = globalShortcuts();
}
