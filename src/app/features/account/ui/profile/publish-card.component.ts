import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatSlideToggle, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';

import { ApiProblem } from '../../../../core/http';
import { ACCOUNT_PATHS } from '../../../../shared/ui';
import { MissingItem } from '../../data/profile.store';
import { missingLabel } from './profile-labels';

/** Point de coupure invisible (U+200B) de l'adresse publique. */
const ZERO_WIDTH_SPACE = '​';

/** Une ligne de la liste de contrôle : réglée, à faire (bloquante) ou à signaler (non bloquante). */
export interface ChecklistItem {
  id: string;
  label: string;
  state: 'ok' | 'todo' | 'warning';
}

/**
 * « Apparaître dans l'annuaire » (fiche 10, colonne droite) : interrupteur *Publié*, adresse de la
 * fiche, liste de contrôle, refus 409 détaillé (missing[] → lignes à corriger), confirmation inline
 * de la dépublication (« La fiche disparaît immédiatement »), ouvrir et copier le lien. Le serveur
 * reste juge : l'interrupteur ne bascule qu'après sa réponse.
 */
@Component({
  selector: 'pm-publish-card',
  imports: [RouterLink, MatSlideToggle],
  template: `
    <section class="card" aria-labelledby="publish-title">
      <div class="head">
        <h2 id="publish-title" i18n="Titre de la carte de publication@@profile.publish.title">
          Apparaître dans l'annuaire
        </h2>
        <!-- Une fiche publiée se retire toujours, même si le dossier n'est plus approuvé. Pendant
             l'appel ou la confirmation : aria-disabled (disabledInteractive), le focus reste ici. -->
        <mat-slide-toggle
          class="publish-toggle"
          [class.on]="published()"
          [checked]="published()"
          [disabled]="locked() || busy() || confirming()"
          [disabledInteractive]="!locked()"
          [aria-describedby]="locked() ? 'publish-locked' : 'publish-state'"
          (change)="toggle($event)"
          i18n="Interrupteur de publication@@profile.publish.toggle"
          >Publié</mat-slide-toggle
        >
      </div>

      @if (locked()) {
        <p class="locked" id="publish-locked">
          <strong i18n="Publication impossible, dossier non approuvé@@profile.publish.lockedTitle"
            >Dossier en cours de vérification.</strong
          >
          <span i18n="Explication de la publication verrouillée@@profile.publish.locked">
            Votre dossier professionnel doit être approuvé avant de publier votre fiche. Vous pouvez
            déjà la remplir : rien n'est visible tant qu'elle n'est pas publiée.
          </span>
          <a
            [routerLink]="paths.verification"
            i18n="Lien vers le dossier professionnel@@profile.publish.lockedLink"
            >Voir mon dossier professionnel</a
          >
        </p>
      }

      <div class="text" id="publish-state">
        @if (published()) {
          <p i18n="Fiche publiée@@profile.publish.visible">
            Votre fiche est visible dans l'annuaire.
          </p>
        } @else {
          <p i18n="Fiche non publiée@@profile.publish.hidden">
            Une fois publiée, votre fiche sera visible dans l'annuaire.
          </p>
        }
        <!-- Adresse sur sa propre ligne, en mono, coupée seulement après les « / ». -->
        <p class="url-line">
          <span i18n="Libellé de l'adresse publique@@profile.publish.urlLabel"
            >Adresse publique :</span
          >&ngsp;<span class="url" [attr.title]="publicUrl()">{{ displayUrl() }}</span>
        </p>
        <p i18n="Effet de la dépublication@@profile.publish.unpublishNote">
          Désactiver retire la fiche immédiatement de l'annuaire.
        </p>
      </div>

      @if (confirming()) {
        <div class="confirm" role="group" aria-labelledby="unpublish-question">
          <p id="unpublish-question" i18n="Confirmation de dépublication@@profile.publish.confirm">
            Retirer la fiche de l'annuaire ? Elle disparaît immédiatement ; vos informations restent
            enregistrées pour une prochaine publication.
          </p>
          <div class="actions">
            <button
              #confirmButton
              type="button"
              class="button danger"
              [disabled]="busy()"
              (click)="confirmUnpublish()"
              i18n="Bouton de confirmation de dépublication@@profile.publish.confirmYes"
            >
              Retirer la fiche
            </button>
            <button
              type="button"
              class="button"
              [disabled]="busy()"
              (click)="cancelUnpublish()"
              i18n="Bouton d'annulation de dépublication@@profile.publish.confirmNo"
            >
              Garder la fiche publiée
            </button>
          </div>
        </div>
      }

      @if (missing().length > 0) {
        <div class="refused" role="alert" data-testid="publish-refused">
          <p class="refused-title" i18n="Publication refusée, titre@@profile.publish.refused">
            Publication refusée. À corriger :
          </p>
          <ul>
            @for (item of missing(); track item) {
              <li>
                @if (item === 'verification') {
                  {{ label(item) }}
                  <a
                    [routerLink]="paths.verification"
                    i18n="Lien vers le dossier depuis le refus@@profile.publish.toDossier"
                    >Voir mon dossier</a
                  >
                } @else {
                  <button type="button" class="link" (click)="fix.emit(item)">
                    {{ label(item) }}
                  </button>
                }
              </li>
            }
          </ul>
        </div>
      } @else if (problemText(); as text) {
        <p class="refused" role="alert">{{ text }}</p>
      }

      <ul
        class="checklist"
        aria-label="Liste de contrôle"
        i18n-aria-label="Liste de contrôle de la publication@@profile.checklist.label"
      >
        @for (item of checklist(); track item.id) {
          <li [class]="item.state">
            <span class="mark" aria-hidden="true">{{ mark(item.state) }}</span>
            <span>
              <span class="sr-only">{{ stateText(item.state) }}&#32;</span>{{ item.label }}
            </span>
          </li>
        }
      </ul>

      <div class="actions">
        @if (published()) {
          <a
            class="button"
            [href]="publicUrl()"
            target="_blank"
            rel="noopener"
            i18n="Lien vers la fiche publique@@profile.publish.open"
            >Ouvrir la fiche publique</a
          >
        }
        <button
          type="button"
          class="button"
          (click)="copyLink.emit()"
          i18n="Bouton pour copier le lien de la fiche@@profile.publish.copy"
        >
          Copier le lien
        </button>
      </div>
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--surface-raised);
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h2 {
      margin: 0;
      color: var(--text-primary);
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }
    /* « Publié » en vert (fiche 10, Tokens) : piste et libellé une fois la fiche publiée. */
    .publish-toggle {
      flex: none;
      --mat-slide-toggle-label-text-color: var(--text-secondary);
      --mat-slide-toggle-selected-track-color: var(--success);
      --mat-slide-toggle-selected-hover-track-color: var(--success);
      --mat-slide-toggle-selected-focus-track-color: var(--success);
      --mat-slide-toggle-selected-pressed-track-color: var(--success);
      --mat-slide-toggle-selected-hover-state-layer-color: var(--success);
      --mat-slide-toggle-selected-focus-state-layer-color: var(--success);
      --mat-slide-toggle-selected-pressed-state-layer-color: var(--success);
    }
    .publish-toggle.on {
      --mat-slide-toggle-label-text-color: var(--success);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .text p {
      margin: 0;
    }
    .url-line {
      color: var(--text-primary);
    }
    .text,
    .locked {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .locked {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--warning-bg);
      color: var(--text-primary);
    }
    .locked a,
    .refused a {
      color: var(--primary);
    }
    .url {
      display: block;
      color: var(--primary);
      font-family: var(--font-mono);
      font-size: 12px;
      /* Un segment plus long que la colonne se coupe quand même, en dernier recours. */
      overflow-wrap: break-word;
    }
    .confirm,
    .refused {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 10px 12px;
      border-radius: 8px;
      font: var(--mat-sys-body-small);
      color: var(--text-primary);
    }
    .confirm {
      background: var(--surface-sunken);
    }
    .confirm p,
    .refused-title {
      margin: 0;
    }
    .refused {
      background: var(--danger-bg);
    }
    .refused-title {
      font-weight: 600;
    }
    .refused ul {
      margin: 0;
      padding-left: 18px;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary);
      font: inherit;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }
    .checklist {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
    }
    .checklist li {
      display: flex;
      gap: 8px;
      color: var(--text-primary);
    }
    .checklist li.ok {
      color: var(--success);
    }
    .checklist li.warning {
      color: var(--warning);
    }
    .mark {
      flex: 0 0 14px;
      font-weight: 700;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      text-decoration: none;
      cursor: pointer;
    }
    .button.danger {
      border-color: var(--danger);
      background: var(--danger);
      color: var(--danger-on);
    }
    .button[disabled] {
      cursor: default;
      color: var(--text-disabled);
      background: var(--surface-sunken);
      border-color: var(--border-subtle);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishCardComponent {
  readonly published = input(false);
  /** Dossier approuvé : sinon l'interrupteur est inactif avec son motif. */
  readonly canPublish = input(false);
  readonly busy = input(false);
  readonly publicUrl = input.required<string>();
  readonly checklist = input<readonly ChecklistItem[]>([]);
  /** missing[] du dernier refus 409. */
  readonly missing = input<readonly MissingItem[]>([]);
  /** Autre erreur de la dernière publication ou dépublication. */
  readonly problem = input<ApiProblem | null>(null);

  readonly publish = output<void>();
  readonly unpublish = output<void>();
  readonly copyLink = output<void>();
  readonly fix = output<MissingItem>();

  protected readonly paths = ACCOUNT_PATHS;
  protected readonly confirming = signal(false);
  private readonly injector = inject(Injector);
  private readonly toggleInput = viewChild(MatSlideToggle);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  /** Publier exige un dossier approuvé ; retirer une fiche publiée reste toujours possible. */
  protected readonly locked = computed(() => !this.published() && !this.canPublish());

  protected readonly problemText = computed(() => {
    const problem = this.problem();
    if (!problem) return null;
    return problem.status === 422
      ? $localize`:Publication impossible, formulaire à corriger@@profile.publish.fixFields:Corrigez les champs signalés avant de publier.`
      : $localize`:Échec de la publication ou dépublication@@profile.publish.failed:L'opération n'a pas abouti. Réessayez dans un instant.`;
  });

  /**
   * Adresse sans le schéma (« psymate.com/praticiens/claire-martin ») ; une espace sans chasse après
   * chaque « / » : la ligne ne se coupe qu'entre deux segments, jamais au milieu d'un mot.
   */
  protected readonly displayUrl = computed(() =>
    this.publicUrl()
      .replace(/^https?:\/\//, '')
      .replace(/\/(?=.)/g, `/${ZERO_WIDTH_SPACE}`),
  );

  protected toggle(event: MatSlideToggleChange): void {
    const wanted = event.checked;
    // L'interrupteur suit le serveur, pas le clic : il bascule quand le profil relu le dit.
    event.source.checked = this.published();
    if (this.busy() || this.confirming()) return;
    if (wanted) {
      this.publish.emit();
      return;
    }
    // Confirmation inline : le focus va sur « Retirer la fiche ».
    this.confirming.set(true);
    afterNextRender(() => this.confirmButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected confirmUnpublish(): void {
    this.confirming.set(false);
    this.focusToggle();
    this.unpublish.emit();
  }

  protected cancelUnpublish(): void {
    this.confirming.set(false);
    this.focusToggle();
  }

  private focusToggle(): void {
    afterNextRender(() => this.toggleInput()?.focus(), { injector: this.injector });
  }

  protected label(item: MissingItem): string {
    return missingLabel(item);
  }

  protected mark(state: ChecklistItem['state']): string {
    return state === 'ok' ? '✓' : state === 'warning' ? '⚠' : '✗';
  }

  protected stateText(state: ChecklistItem['state']): string {
    switch (state) {
      case 'ok':
        return $localize`:État d'une ligne de contrôle réglée@@profile.checklist.ok:Fait :`;
      case 'warning':
        return $localize`:État d'une ligne de contrôle à signaler@@profile.checklist.warning:À noter :`;
      case 'todo':
        return $localize`:État d'une ligne de contrôle à faire@@profile.checklist.todo:À faire :`;
    }
  }
}
