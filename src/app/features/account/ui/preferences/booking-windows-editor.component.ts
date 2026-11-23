import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { BOOKING_WINDOWS_MAX, BookingWindow } from '../../../../core/preferences';
import {
  DAY_LABELS,
  dayGroupLabel,
  endLabel,
  faultMessage,
  removeLabel,
  startLabel,
} from './booking-labels';
import {
  DraftWindow,
  sameWindows,
  sortWindows,
  toWindows,
  WEEK_DAYS,
  WeekDay,
  WindowFault,
  windowFaults,
} from './booking-windows';

let nextEditorId = 0;

/**
 * Éditeur des plages ouvertes (fiche 14, « Prise de rendez-vous en ligne », `booking.windows`) :
 * sept jours, leurs plages (Début, Fin au format HH:MM, Retirer), « Ajouter une plage », puis un pied
 * avec le compteur, « Annuler les modifications » et « Enregistrer les plages ».
 *
 * Les plages saisies sont l'état d'écran du composant : rien ne part avant « Enregistrer les
 * plages », qui émet la liste complète (`save`), et seulement si chaque plage est bien formée. Le
 * brouillon repart des plages du serveur (`windows`) chaque fois que celles-ci changent (après une
 * écriture relue) ; un refus du serveur ne les change pas, le brouillon reste donc à l'écran.
 */
@Component({
  selector: 'pm-booking-windows-editor',
  imports: [MatButtonModule],
  template: `
    <div
      class="editor"
      tabindex="-1"
      role="group"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="shownServerError() ? uid + '-server-error' : null"
      #box
    >
      @for (day of days; track day) {
        <div class="wd-day" role="group" [attr.aria-label]="groupLabel(day)">
          <h3>{{ dayTitle(day) }}</h3>
          <div class="wd-body">
            @if (rowsOf(day); as rows) {
              @if (rows.length === 0) {
                <p class="wd-none" i18n="Jour sans plage@@preferences.booking.window.none">
                  Aucune plage
                </p>
              } @else {
                <ul class="wd-list">
                  @for (row of rows; track row.key; let i = $index) {
                    <li>
                      <div class="wd-range" (focusout)="touch(row.key)">
                        <label class="sr-only" [for]="startId(row.key)">{{
                          startLabel(day, i + 1)
                        }}</label>
                        <input
                          class="time"
                          dir="ltr"
                          type="text"
                          inputmode="numeric"
                          maxlength="5"
                          autocomplete="off"
                          [id]="startId(row.key)"
                          [value]="row.start"
                          [attr.aria-invalid]="shownFault(row.key) ? 'true' : null"
                          [attr.aria-describedby]="shownFault(row.key) ? errorId(row.key) : null"
                          (input)="edit(row.key, 'start', $event)"
                        />
                        <span class="dash" aria-hidden="true">–</span>
                        <label class="sr-only" [for]="endId(row.key)">{{
                          endLabel(day, i + 1)
                        }}</label>
                        <input
                          class="time"
                          dir="ltr"
                          type="text"
                          inputmode="numeric"
                          maxlength="5"
                          autocomplete="off"
                          [id]="endId(row.key)"
                          [value]="row.end"
                          [attr.aria-invalid]="shownFault(row.key) ? 'true' : null"
                          [attr.aria-describedby]="shownFault(row.key) ? errorId(row.key) : null"
                          (input)="edit(row.key, 'end', $event)"
                        />
                        <button
                          type="button"
                          class="icon-btn"
                          [attr.aria-label]="removeLabel(day, row.start, row.end)"
                          title="Retirer"
                          i18n-title="
                            Infobulle du bouton qui retire une
                            plage@@preferences.booking.window.removeTitle"
                          (click)="remove(row)"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="m6 6 12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                      @if (shownFault(row.key); as fault) {
                        <p class="error" role="alert" [id]="errorId(row.key)">
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M12 3.5 2.5 20h19L12 3.5Z" />
                            <path d="M12 10v5M12 17.5v.5" />
                          </svg>
                          <span>{{ faultText(fault) }}</span>
                        </p>
                      }
                    </li>
                  }
                </ul>
              }
            }
            <button
              mat-button
              type="button"
              class="wd-add"
              [id]="addId(day)"
              [disabled]="full()"
              (click)="add(day)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span i18n="Bouton qui ajoute une plage à un jour@@preferences.booking.window.add"
                >Ajouter une plage</span
              >
            </button>
          </div>
        </div>
      }
      <div class="wd-foot">
        <span class="count">
          <span
            i18n="Compteur des plages de l'éditeur@@preferences.booking.window.count"
            >{drafts().length, plural,
              =0 {0 plage sur {{ max }}}
              =1 {1 plage sur {{ max }}}
              other {{{ drafts().length }} plages sur {{ max }}}
            }</span
          >
          @if (full()) {
            <span aria-hidden="true"> · </span>
            <strong role="status">{{ maxText }}</strong>
          }
        </span>
        <span class="buttons">
          <span class="saved-flag" role="status">{{ flagText() }}</span>
          @if (dirty()) {
            <button
              mat-stroked-button
              type="button"
              (click)="cancel()"
              i18n="
                Bouton qui annule les modifications des plages@@preferences.booking.window.cancel"
            >
              Annuler les modifications
            </button>
          }
          <button
            mat-flat-button
            type="button"
            class="save"
            [disabled]="!canSave()"
            (click)="submit()"
            i18n="Bouton qui enregistre les plages@@preferences.booking.window.save"
          >
            Enregistrer les plages
          </button>
        </span>
      </div>
    </div>
    @if (shownServerError(); as message) {
      <p class="error server" role="alert" [id]="uid + '-server-error'">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5 2.5 20h19L12 3.5Z" />
          <path d="M12 10v5M12 17.5v.5" />
        </svg>
        <span>{{ message }}</span>
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .editor {
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }
    .editor:focus {
      outline: none;
    }
    .editor:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .wd-day {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 8px 16px;
      align-items: start;
      padding: 10px 12px;
      border-top: 1px solid var(--border-subtle);
    }
    .wd-day:first-child {
      border-top: 0;
    }
    h3 {
      margin: 0;
      padding-top: 6px;
      color: var(--text-primary);
      font: var(--mat-sys-body-medium);
      font-weight: 600;
    }
    .wd-body,
    .wd-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
      min-width: 0;
    }
    .wd-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .wd-range {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 8px;
      align-items: center;
    }
    .dash {
      color: var(--text-secondary);
    }
    .wd-none {
      margin: 0;
      padding-top: 6px;
      color: var(--text-secondary);
      font: var(--mat-sys-body-medium);
    }
    .time {
      width: 72px;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--border-strong);
      border-radius: 4px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: 14px/1.4 var(--font-mono);
      text-align: center;
    }
    .time[aria-invalid='true'] {
      border-color: var(--danger);
      border-width: 2px;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }
    .icon-btn:hover {
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    svg {
      width: 16px;
      height: 16px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wd-add svg {
      margin-inline-end: 6px;
    }
    .wd-foot {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-top: 1px solid var(--border-subtle);
      border-radius: 0 0 8px 8px;
      background: var(--surface-ground);
    }
    .count,
    .saved-flag {
      color: var(--text-secondary);
      font: var(--mat-sys-body-medium);
    }
    .count strong {
      color: var(--text-primary);
      font-weight: 600;
    }
    .saved-flag:empty {
      display: none;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .error {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      margin: 6px 0 0;
      color: var(--danger);
      font: var(--mat-sys-body-small);
    }
    .error svg {
      width: 14px;
      height: 14px;
      margin-top: 1px;
    }
    .error.server {
      margin: 0;
    }
    @media (max-width: 760px) {
      .wd-day {
        grid-template-columns: minmax(0, 1fr);
      }
      h3,
      .wd-none {
        padding-top: 0;
      }
      .buttons,
      .buttons button {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingWindowsEditorComponent {
  /** Plages enregistrées, telles que le serveur les a renvoyées. */
  readonly windows = input.required<readonly BookingWindow[]>();
  /** Enregistrement en cours : « Enregistrer les plages » reste inactif. */
  readonly saving = input(false);
  /** Message d'un refus du serveur (422 sur `booking.windows`), affiché sous l'éditeur. */
  readonly serverError = input<string | null>(null);
  /** Id du libellé de la ligne (« Plages ouvertes ») : nom du groupe de l'éditeur. */
  readonly labelledBy = input<string | null>(null);

  /** La liste complète, bien formée, à enregistrer. */
  readonly save = output<BookingWindow[]>();

  private readonly injector = inject(Injector);
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  protected readonly uid = `booking-windows-${nextEditorId++}`;
  protected readonly days = WEEK_DAYS;
  protected readonly max = BOOKING_WINDOWS_MAX;
  protected readonly maxText = $localize`:Plafond des plages atteint@@preferences.booking.window.max:${BOOKING_WINDOWS_MAX}:max: plages au plus.`;

  private nextKey = 0;

  /** Refus du serveur affiché ; « Annuler les modifications » l'efface avec le brouillon. */
  protected readonly shownServerError = linkedSignal(() => this.serverError());

  /** Les plages du serveur, égales par contenu : un relu identique ne remet pas le brouillon à zéro. */
  private readonly saved = computed(() => sortWindows(this.windows()), { equal: sameWindows });

  protected readonly drafts = linkedSignal<DraftWindow[]>(() =>
    this.saved().map((window) => ({ ...window, day: window.day as WeekDay, key: this.nextKey++ })),
  );

  /** Plages dont un champ a perdu le focus : leur faute de format s'affiche. */
  private readonly touched = linkedSignal<ReadonlySet<number>>(() => {
    this.saved();
    return new Set<number>();
  });

  protected readonly faults = computed(() => windowFaults(this.drafts()));
  protected readonly full = computed(() => this.drafts().length >= BOOKING_WINDOWS_MAX);
  protected readonly dirty = computed(() => !sameWindows(toWindows(this.drafts()), this.saved()));
  protected readonly canSave = computed(
    () => this.dirty() && this.faults().size === 0 && !this.saving(),
  );

  protected readonly flagText = computed(() => {
    if (this.dirty()) {
      return $localize`:Plages modifiées pas encore enregistrées@@preferences.booking.window.unsaved:Modifications non enregistrées`;
    }
    return this.saved().length > 0
      ? $localize`:Plages enregistrées@@preferences.booking.window.saved:Enregistré`
      : '';
  });

  protected readonly startLabel = startLabel;
  protected readonly endLabel = endLabel;
  protected readonly removeLabel = removeLabel;

  protected rowsOf(day: WeekDay): DraftWindow[] {
    return this.drafts().filter((draft) => draft.day === day);
  }

  protected dayTitle(day: WeekDay): string {
    return DAY_LABELS[day].title;
  }

  protected groupLabel(day: WeekDay): string {
    return dayGroupLabel(day);
  }

  /**
   * Faute affichée sous une plage : fin avant début et chevauchement dès que les heures sont bien
   * formées ; format seulement une fois la plage quittée (pas pendant la frappe).
   */
  protected shownFault(key: number): WindowFault | null {
    const fault = this.faults().get(key) ?? null;
    if (fault === 'format' && !this.touched().has(key)) return null;
    return fault;
  }

  protected faultText = faultMessage;

  protected startId(key: number): string {
    return `${this.uid}-start-${key}`;
  }
  protected endId(key: number): string {
    return `${this.uid}-end-${key}`;
  }
  protected errorId(key: number): string {
    return `${this.uid}-error-${key}`;
  }
  protected addId(day: WeekDay): string {
    return `${this.uid}-add-${day}`;
  }

  protected edit(key: number, field: 'start' | 'end', event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.drafts.update((drafts) =>
      drafts.map((draft) => (draft.key === key ? { ...draft, [field]: value } : draft)),
    );
  }

  protected touch(key: number): void {
    if (this.touched().has(key)) return;
    this.touched.update((keys) => new Set([...keys, key]));
  }

  /** Nouvelle plage vide en fin de jour ; le focus va sur son champ Début. */
  protected add(day: WeekDay): void {
    if (this.full()) return;
    const key = this.nextKey++;
    this.drafts.update((drafts) => [...drafts, { key, day, start: '', end: '' }]);
    this.focusAfterRender(this.startId(key));
  }

  /** Retire une plage ; le focus va sur « Ajouter une plage » du même jour. */
  protected remove(row: DraftWindow): void {
    this.drafts.update((drafts) => drafts.filter((draft) => draft.key !== row.key));
    this.focusAfterRender(this.addId(row.day));
  }

  /** Revient aux plages enregistrées ; le focus revient sur l'éditeur. */
  protected cancel(): void {
    this.drafts.set(
      this.saved().map((window) => ({
        ...window,
        day: window.day as WeekDay,
        key: this.nextKey++,
      })),
    );
    this.touched.set(new Set());
    this.shownServerError.set(null);
    this.box().nativeElement.focus();
  }

  protected submit(): void {
    if (!this.canSave()) return;
    this.save.emit(toWindows(this.drafts()));
  }

  private focusAfterRender(id: string): void {
    afterNextRender(
      () => {
        const host = this.box().nativeElement;
        host.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus();
      },
      { injector: this.injector },
    );
  }
}
