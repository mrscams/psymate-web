import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { PatientShellStore } from '../data/patient-shell.store';

/** Ce que l'onglet Séance range dans la mémoire du dossier (B2) : les points « Prévu » cochés. */
export interface SessionTabState {
  sessionId: string;
  ticked: string[];
}

/**
 * « Prévu la dernière fois » (UX-S3, proposition 04b, états 2 et 3) : les lignes « Prochaine fois : »
 * du dernier compte rendu, une case par ligne et « Noter ». Cocher n'enregistre rien : un confort
 * pour la séance, rangé dans la mémoire de l'onglet (rememberTab, le temps du dossier ouvert).
 * « Noter » met « <point> : » dans le bloc de saisie (demande au store, le bloc est dans la page du
 * shell), pour que la première note soit à une Entrée. La même liste sert dans le carnet vide (colonne
 * principale) et, une fois quelque chose noté, dans la colonne latérale ; une seule à la fois.
 */
@Component({
  selector: 'pm-planned-checklist',
  template: `
    <ul class="checklist">
      @for (line of lines(); track $index) {
        <li [class.done]="isTicked(line)">
          <input
            type="checkbox"
            class="cb"
            [id]="'planned-' + $index"
            [checked]="isTicked(line)"
            (change)="toggle(line)"
          />
          <label [for]="'planned-' + $index">{{ line }}</label>
          <button type="button" class="ghost" (click)="note(line)">
            <ng-container i18n="Bouton noter d'un point prévu@@patientShell.planned.note"
              >Noter</ng-container
            >
            <span class="sr-only"> : {{ line }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .checklist {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      font-size: 13.5px;
    }
    label {
      flex: 1;
      min-width: 0;
      color: var(--text-primary);
    }
    .done label {
      color: var(--text-secondary);
      text-decoration: line-through;
    }
    .cb {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--entry-session);
    }
    .ghost {
      min-height: 32px;
      padding: 0 8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--primary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .ghost:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannedChecklistComponent {
  /** Les points à reprendre (splitNextTime du compte rendu précédent). */
  readonly lines = input.required<string[]>();

  private readonly shell = inject(PatientShellStore);
  /** Points cochés, repris de la mémoire de l'onglet pour la séance ouverte. */
  protected readonly ticked = signal<string[]>([]);

  constructor() {
    effect(() => {
      const session = this.shell.currentSession();
      untracked(() => {
        const remembered = this.shell.recallTab<SessionTabState>('session');
        this.ticked.set(session && remembered?.sessionId === session.id ? remembered.ticked : []);
      });
    });
  }

  protected isTicked(line: string): boolean {
    return this.ticked().includes(line);
  }

  protected toggle(line: string): void {
    const session = this.shell.currentSession();
    if (!session) return;
    const list = this.isTicked(line)
      ? this.ticked().filter((item) => item !== line)
      : [...this.ticked(), line];
    this.ticked.set(list);
    this.shell.rememberTab<SessionTabState>('session', { sessionId: session.id, ticked: list });
  }

  /** « Noter » (04b, état 2) : le bloc de saisie reçoit « <point> : », caret à la fin. */
  protected note(line: string): void {
    this.shell.requestPrefill(`${line} : `);
  }
}
