import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { initials } from '../../../shared/util';
import { Availability } from '../data/directory.models';
import { availabilityLabel, professionLabel } from './labels';

/**
 * Initiales sur fond primaire pâle (fiches 08, 09 : `photoUrl` est toujours null en V1), lues
 * « Photo de … (initiales …) » comme le demande la fiche 08.
 */
@Component({
  selector: 'pm-practitioner-avatar',
  template: `<span class="avatar" [class.large]="large()" role="img" [attr.aria-label]="label()"
    ><span aria-hidden="true">{{ letters() }}</span></span
  >`,
  styles: `
    .avatar {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: 600 20px/1 var(--font-ui);
    }
    .avatar.large {
      width: 112px;
      height: 112px;
      border-radius: 14px;
      font-size: 36px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PractitionerAvatarComponent {
  readonly name = input.required<string>();
  readonly large = input(false);
  protected readonly letters = computed(() => initials(this.name()));
  protected readonly label = computed(
    () =>
      $localize`:Avatar sans photo d'un praticien (fiche 08)@@public.avatar.label:Photo de ${this.name()}:name: (initiales ${this.letters()}:initials:)`,
  );
}

/** Badge « Profil vérifié » : vert avec coche, jamais la couleur seule (fiche 08). */
@Component({
  selector: 'pm-verified-badge',
  template: `
    <span class="verified">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      <span i18n="Badge d'un praticien au dossier approuvé@@public.verified">Profil vérifié</span>
    </span>
  `,
  styles: `
    .verified {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--success-bg);
      color: var(--success);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
    @media (max-width: 720px) {
      .verified {
        padding: 2px 6px;
      }
    }
    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifiedBadgeComponent {}

/**
 * Puce de profession (fiche 08) : psychologue en tons « ressenti » (exception délibérée de
 * l'étude), psychiatre en bleu ardoise, coach en neutre.
 */
@Component({
  selector: 'pm-profession-chip',
  template: `<span class="chip" [class]="profession()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font: var(--mat-sys-label-medium);
      background: var(--surface-sunken);
      color: var(--text-secondary);
    }
    .chip.psychologist {
      background: var(--feeling-tint);
      color: var(--feeling-text);
    }
    .chip.psychiatrist {
      background: var(--info-bg);
      color: var(--info);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionChipComponent {
  readonly profession = input.required<string>();
  protected readonly label = computed(() => professionLabel(this.profession()));
}

/** Disponibilité : « Accepte de nouveaux patients » en primaire pâle, les autres neutres. */
@Component({
  selector: 'pm-availability',
  template: `
    @if (label(); as text) {
      <span class="availability" [class.accepting]="availability() === 'accepting'">
        @if (availability() === 'accepting') {
          <span class="dot" aria-hidden="true"></span>
        }
        {{ text }}
      </span>
    }
  `,
  // Maquette 08 : « Accepte… » en primaire pâle avec un point vert ; les autres neutres bordés.
  styles: `
    .availability {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      font: 500 12px/1.4 var(--font-ui);
      background: var(--surface-ground);
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .availability.accepting {
      border-color: transparent;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font-weight: 600;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
    }
    /* Liste mobile : vérifié et disponibilité tiennent sur une ligne. */
    @media (max-width: 720px) {
      .availability {
        padding: 2px 6px;
      }
      .availability.accepting {
        font-weight: 500;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilityComponent {
  readonly availability = input.required<Availability>();
  protected readonly label = computed(() => availabilityLabel(this.availability()));
}
