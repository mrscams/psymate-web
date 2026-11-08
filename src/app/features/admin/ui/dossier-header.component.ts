import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';

import { initials } from '../../../shared/util';
import { Dossier } from '../data/admin.model';
import { formatAge, formatDay, professionLabel, statusLabel, statusTone } from './admin-labels';

/**
 * En-tête du dossier ouvert (fiche 20) : initiales, nom, profession, statut, dates de création,
 * de confirmation et de soumission ; coordonnées en `dl` (e-mail, téléphone, n° pro, cabinet).
 */
@Component({
  selector: 'pm-dossier-header',
  template: `
    @let d = dossier();
    <div class="identity">
      <span class="initials" aria-hidden="true">{{ initialsText() }}</span>
      <div class="titles">
        <h2 [id]="headingId()">{{ d.displayName }}</h2>
        <p class="chips">
          <span class="badge neutral">{{ profession() }}</span>
          <span class="badge" [class]="tone()">{{ status() }}</span>
          @if (d.overdue) {
            <span class="badge danger" i18n="Mention d'un dossier hors délai@@admin.queue.overdue"
              >hors délai</span
            >
          }
        </p>
        <p class="dates">{{ dates() }}</p>
      </div>
    </div>
    <dl>
      <div>
        <dt i18n="Coordonnée du dossier@@admin.dossier.email">E-mail</dt>
        <dd>{{ d.email }}</dd>
      </div>
      <div>
        <dt i18n="Coordonnée du dossier@@admin.dossier.phone">Téléphone</dt>
        <dd>{{ d.phone ?? '—' }}</dd>
      </div>
      <div>
        <dt i18n="Coordonnée du dossier@@admin.dossier.number">N° professionnel déclaré</dt>
        <dd class="mono">{{ d.professionalNumber ?? '—' }}</dd>
      </div>
      <div>
        <dt i18n="Coordonnée du dossier@@admin.dossier.office">Cabinet</dt>
        <dd>{{ office() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './dossier-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DossierHeaderComponent {
  readonly dossier = input.required<Dossier>();
  readonly headingId = input('dossier-title');

  private readonly locale = inject(LOCALE_ID);

  protected readonly initialsText = computed(() => initials(this.dossier().displayName));
  protected readonly profession = computed(() => professionLabel(this.dossier().profession));
  protected readonly status = computed(() => statusLabel(this.dossier().verificationStatus));
  protected readonly tone = computed(() => statusTone(this.dossier().verificationStatus));

  protected readonly dates = computed(() => {
    const d = this.dossier();
    const created = formatDay(d.createdAt, this.locale);
    const parts = [
      $localize`:Date de création du compte@@admin.dossier.created:Compte créé le ${created}:date:`,
    ];
    parts.push(
      d.emailConfirmedAt
        ? $localize`:E-mail confirmé@@admin.dossier.confirmed:e-mail confirmé`
        : $localize`:E-mail non confirmé@@admin.dossier.unconfirmed:e-mail non confirmé`,
    );
    if (d.submittedAt) {
      const age = formatAge(d.submittedAt, this.locale);
      parts.push($localize`:Soumission du dossier@@admin.dossier.submitted:soumis ${age}:age:`);
    }
    return parts.join(' · ');
  });

  protected readonly office = computed(() => {
    const d = this.dossier();
    const address = [d.street, [d.postalCode, d.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
    if (address) return address;
    return d.remoteOnly
      ? $localize`:Cabinet absent, exercice à distance@@admin.dossier.remote:À distance uniquement`
      : '—';
  });
}
