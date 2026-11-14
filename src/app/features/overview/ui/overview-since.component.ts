import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { StateAction, StateComponent } from '../../../shared/ui';
import { Loadable, uniqueId } from '../../../shared/util';
import { OverviewView, sinceFacts } from '../data/overview.model';
import { emphasize, formatIntensity } from './overview-labels';

/**
 * Bande « Depuis la séance du 5 novembre » (UX-S6, proposition 02 `.since-strip`) : en tête de la
 * colonne de lecture, fond raised, bordure discrète. À gauche le titre (15/650), les phrases du
 * serveur (narrative.sentences, mot pour mot, leurs faits en gras) et le point d'attention
 * (narrative.attention) ; à droite trois chiffres (`.facts`) : ressentis notés depuis la séance,
 * dernière moyenne sur 7 jours du serveur avec son sens, brouillons. Sans séance passée : « Depuis
 * l'ouverture du dossier » (décision 3 du 14 novembre 2026).
 */
@Component({
  selector: 'pm-overview-since',
  imports: [StateComponent],
  template: `
    <section
      class="since-strip"
      [attr.aria-labelledby]="headingId"
      [attr.aria-busy]="refreshing() || null"
    >
      @if (view(); as v) {
        <div class="text">
          <h3 [id]="headingId">{{ heading() }}</h3>
          @if (brief().length) {
            <p class="brief">
              @for (sentence of brief(); track $index) {
                <span class="sentence">
                  @for (part of sentence; track $index) {
                    @if (part.strong) {
                      <b>{{ part.text }}</b>
                    } @else {
                      <span>{{ part.text }}</span>
                    }
                  }</span
                >&ngsp;
              }
            </p>
          }
          @if (v.narrative.attention; as attention) {
            <p class="attention">
              <b i18n="Libellé du point d'attention@@overview.simple.attention.label"
                >Point d'attention :</b
              >
              {{ attention }}
            </p>
          }
        </div>
        <div class="facts" role="list">
          <div class="fact" role="listitem">
            <b>{{ facts().feelings }}</b
            >&ngsp;
            <span
              i18n="Chiffre de la bande depuis la séance : ressentis@@overview.since.fact.feelings"
              >{facts().feelings, plural, =0 {ressenti} =1 {ressenti} other {ressentis}}</span
            >
          </div>
          <div class="fact" role="listitem">
            <b [class]="trendClass()"
              >{{ intensity() }}
              @if (arrow(); as a) {
                <span class="arrow" aria-hidden="true">{{ a }}</span>
              }</b
            >&ngsp;
            <span
              i18n="Chiffre de la bande depuis la séance : intensité@@overview.since.fact.intensity"
              >intensité · 7 j</span
            >
            @if (directionText(); as text) {
              &ngsp;<span class="sr-only">{{ text }}</span>
            }
          </div>
          <div class="fact" role="listitem">
            <b>{{ facts().drafts }}</b
            >&ngsp;
            <span
              i18n="Chiffre de la bande depuis la séance : brouillons@@overview.since.fact.drafts"
              >{facts().drafts, plural, =0 {brouillon} =1 {brouillon} other {brouillons}}</span
            >
          </div>
        </div>
      } @else {
        <h3 [id]="headingId" class="sr-only">{{ heading() }}</h3>
        <pm-state
          compact
          class="state"
          [kind]="overview().status === 'error' ? 'error' : 'loading'"
          skeleton="block"
          [lines]="3"
          [title]="errorTitle"
          [action]="retryAction"
        />
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .since-strip {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 16px 20px;
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
    }
    .state {
      grid-column: 1 / -1;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 15px;
      line-height: 1.4;
      font-weight: 650;
      color: var(--text-primary);
    }
    p {
      margin: 0;
      max-width: 70ch;
      font-size: 14px;
      line-height: 1.55;
      color: var(--text-primary);
    }
    b {
      font-weight: 600;
    }
    .attention {
      margin-top: 6px;
      color: var(--warning);
    }
    .facts {
      display: flex;
      gap: 22px;
    }
    .fact {
      text-align: center;
    }
    .fact b {
      display: block;
      font-size: 22px;
      line-height: 1.3;
      font-weight: 650;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }
    .fact span {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .fact b.trend-up {
      color: var(--danger);
    }
    .fact b.trend-down {
      color: var(--success);
    }
    .fact b .arrow {
      margin-left: 2px;
      font-size: 15px;
      color: inherit;
    }
    /* Mobile (maquette .phone) : une colonne, les chiffres répartis sous le texte. */
    @media (max-width: 600px) {
      .since-strip {
        grid-template-columns: minmax(0, 1fr);
        padding: 14px;
      }
      h3 {
        font-size: 14px;
      }
      p {
        font-size: 13.5px;
      }
      .facts {
        justify-content: space-around;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewSinceComponent {
  /** La synthèse du store (gardée pendant une relecture). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly refreshing = input(false);
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly headingId = uniqueId('overview-since');
  protected readonly view = computed(() => this.overview().data);
  protected readonly facts = computed(() => {
    const view = this.view();
    return view ? sinceFacts(view) : { feelings: 0, intensity: null, direction: null, drafts: 0 };
  });

  protected readonly heading = computed(() => {
    const at = this.view()?.sinceLastSession.lastSessionAt;
    if (!at) {
      return $localize`:Titre de la bande depuis la séance, sans séance passée@@overview.since.headingOpening:Depuis l'ouverture du dossier`;
    }
    const date = new Intl.DateTimeFormat(this.locale, {
      day: 'numeric',
      month: 'long',
      year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    }).format(new Date(at));
    return $localize`:Titre de la bande depuis la séance, avec sa date (« 5 novembre »)@@overview.since.heading:Depuis la séance du ${date}:date:`;
  });

  /** Phrases du serveur, découpées pour mettre leurs faits en gras (texte inchangé). */
  protected readonly brief = computed(
    () => this.view()?.narrative.sentences.map((sentence) => emphasize(sentence)) ?? [],
  );

  protected readonly intensity = computed(() => {
    const value = this.facts().intensity;
    return value === null ? '—' : formatIntensity(value, this.locale);
  });

  protected readonly trendClass = computed(() => {
    switch (this.facts().direction) {
      case 'up':
        return 'trend-up';
      case 'down':
        return 'trend-down';
      default:
        return '';
    }
  });

  protected readonly arrow = computed(() => {
    switch (this.facts().direction) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return null;
    }
  });

  /** Le sens en toutes lettres (jamais la couleur ni la flèche seules). */
  protected readonly directionText = computed(() => {
    switch (this.facts().direction) {
      case 'up':
        return $localize`:Sens de l'intensité depuis la séance, pour les lecteurs d'écran@@overview.since.fact.up:en hausse depuis la séance`;
      case 'down':
        return $localize`:Sens de l'intensité depuis la séance, pour les lecteurs d'écran@@overview.since.fact.down:en baisse depuis la séance`;
      case 'flat':
        return $localize`:Sens de l'intensité depuis la séance, pour les lecteurs d'écran@@overview.since.fact.flat:stable depuis la séance`;
      default:
        return null;
    }
  });

  protected readonly errorTitle = $localize`:Erreur de la bande depuis la séance@@overview.since.error:Synthèse indisponible`;
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton d'un bloc en erreur@@overview.block.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };
}
