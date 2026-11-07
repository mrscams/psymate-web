import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';

import { FieldProblem } from '../../../core/http';
import { PASSWORD_MIN_LENGTH } from '../../../shared/forms';

type RuleState = 'pending' | 'ok' | 'ko';

interface Rule {
  key: 'length' | 'case' | 'server';
  label: string;
  state: RuleState;
  /** Message du serveur quand la règle est refusée par un 422 (déjà dans la langue du compte). */
  message: string | null;
}

/** Codes de PASSWORD_POLICY par règle (contrat : errors[] sur le champ password). */
const SERVER_CODES: Record<Rule['key'], string[]> = {
  length: ['PASSWORD_TOO_SHORT'],
  case: ['PASSWORD_CASE'],
  server: ['PASSWORD_COMPROMISED', 'PASSWORD_CONTAINS_PERSONAL_DATA'],
};

/**
 * Règles du mot de passe cochées au fil de la saisie (fiche 18 A et C) : longueur et casse vérifiées
 * ici (forme), « pas un mot de passe courant, ni votre nom ni votre e-mail » vérifié à l'envoi par
 * le serveur. Un 422 PASSWORD_POLICY marque la règle fautive en erreur jusqu'à la prochaine saisie.
 * L'état n'est jamais porté par la couleur seule : icône, texte et mention pour le lecteur d'écran.
 */
@Component({
  selector: 'pm-password-rules',
  template: `
    <ul class="rules" [id]="id()">
      @for (rule of rules(); track rule.key) {
        <li [attr.data-state]="rule.state">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            @switch (rule.state) {
              @case ('ok') {
                <path d="M4 10.5l4 4 8-9" />
              }
              @case ('ko') {
                <path d="M5 5l10 10M15 5 5 15" />
              }
              @default {
                <circle cx="10" cy="10" r="6" />
              }
            }
          </svg>
          <span>{{ rule.label }}</span>
          <span class="sr-only">{{ stateText(rule.state) }}</span>
          @if (rule.message) {
            <span class="message">· {{ rule.message }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .rules {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 6px 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    li {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    svg {
      flex: none;
      width: 14px;
      height: 14px;
      align-self: center;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    li[data-state='ok'] {
      color: var(--success);
    }
    li[data-state='ko'] {
      color: var(--danger);
    }
    .message {
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordRulesComponent {
  /** Identifiant de la liste, pour aria-describedby du champ. */
  readonly id = input.required<string>();
  readonly password = input('');
  /** errors[] du 422 PASSWORD_POLICY relatives au mot de passe ; vide sinon. */
  readonly problems = input<readonly FieldProblem[]>([]);

  /** Saisie pour laquelle le serveur a répondu : ses refus ne valent plus une fois le texte changé. */
  private readonly flaggedPassword = signal<string | null>(null);

  constructor() {
    effect(() => {
      const problems = this.problems();
      untracked(() => this.flaggedPassword.set(problems.length > 0 ? this.password() : null));
    });
  }

  private readonly serverProblems = computed(() =>
    this.flaggedPassword() === this.password() ? this.problems() : [],
  );

  protected readonly rules = computed<Rule[]>(() => {
    const password = this.password();
    const refused = (key: Rule['key']): FieldProblem | undefined =>
      this.serverProblems().find((p) => SERVER_CODES[key].includes(p.code));
    const client = (key: Rule['key'], ok: boolean, label: string): Rule => {
      const problem = refused(key);
      if (problem) return { key, label, state: 'ko', message: problem.message || null };
      if (password.length === 0) return { key, label, state: 'pending', message: null };
      return { key, label, state: ok ? 'ok' : 'pending', message: null };
    };
    const server = refused('server');
    return [
      client(
        'length',
        password.length >= PASSWORD_MIN_LENGTH,
        $localize`:Règle de mot de passe, longueur@@account.security.password.rule.length:Au moins ${PASSWORD_MIN_LENGTH}:min: caractères`,
      ),
      client(
        'case',
        /[a-z]/.test(password) && /[A-Z]/.test(password),
        $localize`:Règle de mot de passe, casse@@account.security.password.rule.case:Majuscules et minuscules`,
      ),
      {
        key: 'server',
        label: $localize`:Règle de mot de passe vérifiée par le serveur@@account.security.password.rule.server:Pas un mot de passe courant, ni votre nom ni votre e-mail (vérifié à l'envoi)`,
        state: server ? 'ko' : 'pending',
        message: server?.message || null,
      },
    ];
  });

  protected stateText(state: RuleState): string {
    switch (state) {
      case 'ok':
        return $localize`:Règle respectée, lecteur d'écran@@account.security.password.rule.ok:règle respectée`;
      case 'ko':
        return $localize`:Règle refusée, lecteur d'écran@@account.security.password.rule.ko:règle non respectée`;
      default:
        return '';
    }
  }
}
