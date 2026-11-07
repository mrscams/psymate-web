import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { THEME_PREFERENCES, ThemePreference } from '../../../../core/theme';

/**
 * Choix du thème (fiche 14) : quatre `<input type="radio">` réels dans un `role="radiogroup"`,
 * chaque vignette est un `<label>` ; le texte porte l'information, la vignette est `aria-hidden`.
 * Les vignettes sont dessinées avec les tokens du thème courant (aucune couleur en dur) : elles
 * restent distinguables entre elles, quel que soit le thème actif.
 */
@Component({
  selector: 'pm-theme-picker',
  template: `
    <div
      class="themes"
      role="radiogroup"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
    >
      @for (theme of themes; track theme) {
        <label class="theme" [class.selected]="theme === value()">
          <span class="swatch" [class]="'swatch ' + theme" aria-hidden="true"></span>
          <span class="text">{{ labelOf(theme) }}</span>
          <input
            type="radio"
            [name]="name()"
            [value]="theme"
            [checked]="theme === value()"
            (change)="valueChange.emit(theme)"
          />
        </label>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .themes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .theme {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px 8px 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .theme.selected {
      border-color: var(--primary);
      box-shadow: inset 0 0 0 1px var(--primary);
      background: var(--primary-tint);
      color: var(--primary-hover);
    }
    .theme:has(input:focus-visible) {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .swatch {
      display: inline-block;
      width: 28px;
      height: 20px;
      border-radius: 5px;
      border: 1px solid var(--border-strong);
    }
    .swatch.light {
      background: var(--surface-raised);
    }
    .swatch.soft {
      background: var(--surface-ground);
    }
    .swatch.dark {
      background: var(--text-primary);
    }
    .swatch.system {
      background: linear-gradient(90deg, var(--surface-raised) 50%, var(--text-primary) 50%);
    }
    input {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      opacity: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePickerComponent {
  readonly value = input.required<ThemePreference>();
  readonly name = input('theme');
  readonly labelledBy = input<string>();
  readonly describedBy = input<string>();

  readonly valueChange = output<ThemePreference>();

  protected readonly themes = THEME_PREFERENCES;

  protected labelOf(theme: ThemePreference): string {
    switch (theme) {
      case 'light':
        return $localize`:Thème clair@@preferences.theme.light:Clair`;
      case 'soft':
        return $localize`:Thème au contraste doux@@preferences.theme.soft:Doux`;
      case 'dark':
        return $localize`:Thème sombre@@preferences.theme.dark:Sombre`;
      case 'system':
        return $localize`:Thème qui suit le système@@preferences.theme.system:Système`;
    }
  }
}
