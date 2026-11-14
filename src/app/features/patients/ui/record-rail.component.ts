import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Un lien du rail : ancre d'une section du formulaire et son décompte (maquette 16). */
export interface RailSection {
  id: string;
  label: string;
  /** Décompte affiché (« 4 champs », « 3 », « 1 posé ») ; vide : rien d'affiché. */
  count: string;
  /** Fin du nom accessible du lien, lue après le décompte (« champs renseignés »). */
  countSuffix: string;
  /** Lien discret (« Archivage », maquette 16). */
  quiet?: boolean;
}

/**
 * Rail collant de la fiche patient (proposition 16, `.recnav`) : aperçu de l'en-tête (projeté),
 * liens vers les sections avec leur décompte, section courante marquée (`aria-current`), puis
 * Enregistrer (Ctrl+Entrée), Annuler et la mention des champs modifiés. Le bouton d'envoi est relié
 * au formulaire de la page par son id (`form`). Sous 900 px (maquette mobile) : l'aperçu disparaît,
 * les liens deviennent une rangée de puces collée en haut et les boutons une barre collée en bas.
 */
@Component({
  selector: 'pm-record-rail',
  template: `
    <div class="preview-slot"><ng-content /></div>
    <nav class="sections" [attr.aria-label]="navLabel">
      <ul>
        @for (section of sections(); track section.id) {
          <li>
            <a
              [href]="href() + '#' + section.id"
              [class.quiet]="section.quiet"
              [attr.aria-current]="current() === section.id ? 'true' : null"
              (click)="go($event, section.id)"
            >
              <span class="label">{{ section.label }}</span>
              @if (section.count) {
                <!-- L'espace en tête sépare libellé et décompte dans le nom accessible. -->
                <span class="st"
                  >{{ ' ' + section.count }}
                  @if (section.countSuffix) {
                    <span class="sr-only">{{ ' ' + section.countSuffix }}</span>
                  }
                </span>
              }
            </a>
          </li>
        }
      </ul>
    </nav>
    <div class="save">
      <button
        type="submit"
        class="btn primary"
        [attr.form]="formId()"
        [disabled]="disabled()"
        aria-keyshortcuts="Control+Enter"
      >
        <span>{{ saveLabel() }}</span>
        <kbd i18n="Raccourci d'enregistrement@@patients.form.saveShortcut">Ctrl+↵</kbd>
      </button>
      <button
        type="button"
        class="btn ghost"
        [disabled]="cancelDisabled()"
        (click)="discard.emit()"
      >
        <span class="long">{{ cancelLabel() }}</span>
        <span class="short" i18n="Bouton annuler@@patients.form.cancel">Annuler</span>
      </button>
      <p class="note">{{ note() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 12px;
      /* 4 px autour du contenu : l'anneau de focus des liens n'est pas rogné par le défilement. */
      max-height: calc(100vh - 24px);
      margin: -4px;
      padding: 4px;
      overflow-y: auto;
      color: var(--text-primary);
    }
    .preview-slot {
      margin-bottom: 14px;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      color: var(--text-secondary);
      font: 400 13.5px/1.5 var(--font-ui);
      text-decoration: none;

      &:hover {
        color: var(--text-primary);
        background: var(--surface-sunken);
      }

      &[aria-current='true'] {
        background: var(--primary-tint);
        color: var(--primary);
        font-weight: 600;
      }
    }
    .st {
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 400;
    }
    a[aria-current='true'] .st {
      color: var(--primary);
    }
    .save {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }
    .btn {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      justify-content: center;
      height: 36px;
      padding: 0 14px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      font: 600 13.5px/1 var(--font-ui);
      white-space: nowrap;
      cursor: pointer;

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }
    }
    .primary {
      background: var(--primary);
      color: var(--primary-on);

      &:hover:not(:disabled) {
        background: var(--primary-hover);
      }

      kbd {
        border-color: var(--primary-on);
        background: transparent;
        color: var(--primary-on);
      }
    }
    .ghost {
      color: var(--primary);

      &:hover:not(:disabled) {
        background: var(--primary-tint);
      }
    }
    .short {
      display: none;
    }
    .note {
      margin: 0;
      color: var(--text-secondary);
      font: 400 12px/1.5 var(--font-ui);
    }

    /* Maquette mobile : puces en haut, barre d'enregistrement en bas (la page place les deux). */
    @media (max-width: 899.98px) {
      :host {
        display: contents;
      }
      .preview-slot,
      .note,
      kbd {
        display: none;
      }
      .sections {
        position: sticky;
        top: 0;
        z-index: 2;
        order: -1;
        box-sizing: border-box;
        width: calc(100% + 2 * var(--pm-page-gutter, 16px));
        min-width: 0;
        margin: 0 calc(-1 * var(--pm-page-gutter, 16px));
        padding: 10px var(--pm-page-gutter, 16px);
        overflow-x: auto;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--surface-raised);
      }
      ul {
        display: flex;
        gap: 6px;
      }
      a {
        align-items: center;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--surface-sunken);
        font: 500 12px/24px var(--font-ui);
        white-space: nowrap;

        &[aria-current='true'] {
          background: var(--info-bg);
          color: var(--info);
        }
      }
      .st {
        display: none;
      }
      .save {
        position: sticky;
        bottom: 0;
        z-index: 2;
        order: 1;
        display: flex;
        gap: 8px;
        margin: 0 calc(-1 * var(--pm-page-gutter, 16px));
        padding: 10px 12px 14px;
        border-top: 1px solid var(--border-subtle);
        background: var(--surface-raised);
      }
      .primary {
        flex: 1;
      }
      .ghost {
        border-color: var(--border-strong);
        background: var(--surface-raised);
        color: var(--text-primary);
      }
      .long {
        display: none;
      }
      .short {
        display: inline;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordRailComponent {
  readonly sections = input<RailSection[]>([]);
  /** Id de la section courante (défilement ou dernier lien suivi). */
  readonly current = input<string | null>(null);
  /** Adresse de la page (avec la base) : les liens restent de vraies ancres. */
  readonly href = input('');
  readonly formId = input.required<string>();
  readonly saveLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly disabled = input(false);
  readonly cancelDisabled = input(false);
  readonly note = input('');

  /** Lien suivi : la page défile jusqu'à la section et y met le focus. */
  readonly navigate = output<string>();
  /** Annuler : la page remet la fiche lue (modification) ou revient à la liste (création). */
  readonly discard = output<void>();

  protected readonly navLabel = $localize`:Étiquette des liens vers les sections de la fiche@@patients.rail.sections:Sections de la fiche`;

  protected go(event: MouseEvent, id: string): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.navigate.emit(id);
  }
}
