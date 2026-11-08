import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { DossierDocument, ReviewedStatus } from '../data/admin.model';
import { documentTypeLabel, formatSize, mimeLabel, reviewedLabel } from './admin-labels';

/**
 * Justificatifs du dossier (fiche 20) : intitulé · établissement · année, type · format · taille,
 * case « Conforme » par document (PATCH immédiat, par la page), bouton « Afficher » vers la
 * visionneuse ; le document affiché est surligné. Un fichier purgé n'a plus que ses métadonnées.
 */
@Component({
  selector: 'pm-document-list',
  template: `
    <ul [attr.aria-label]="label">
      @for (doc of rows(); track doc.id) {
        <li [class.selected]="doc.id === selectedId()">
          <div class="what">
            <span class="title">{{ doc.heading }}</span>
            <span class="meta">{{ doc.meta }}</span>
            @if (doc.purged) {
              <span class="meta" i18n="Justificatif purgé@@admin.doc.purged"
                >Fichier purgé : seules les informations restent.</span
              >
            }
          </div>
          <label class="conform">
            <input
              type="checkbox"
              [checked]="doc.reviewedStatus === 'conform'"
              [disabled]="doc.purged || reviewing().includes(doc.id)"
              (change)="toggle(doc, $event)"
            />
            <span i18n="Case de qualification d'un justificatif@@admin.doc.conformBox"
              >Conforme</span
            >
            <span class="sr-only">{{ doc.title }}</span>
          </label>
          <button
            type="button"
            class="show"
            [disabled]="doc.purged"
            [attr.aria-pressed]="doc.id === selectedId()"
            (click)="show.emit(doc.id)"
          >
            <span i18n="Bouton d'affichage d'un justificatif@@admin.doc.show">Afficher</span>
            <span class="sr-only">{{ doc.title }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './document-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentListComponent {
  readonly documents = input.required<DossierDocument[]>();
  readonly selectedId = input<string | null>(null);
  readonly reviewing = input<string[]>([]);
  readonly show = output<string>();
  readonly review = output<{ id: string; status: ReviewedStatus }>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly label = $localize`:Étiquette de la liste des justificatifs@@admin.doc.listLabel:Justificatifs du dossier`;

  protected readonly rows = computed(() =>
    this.documents().map((doc) => {
      const heading = [doc.title, doc.issuer, doc.year].filter(Boolean).join(' · ');
      const meta = [
        documentTypeLabel(doc.type),
        mimeLabel(doc.mime),
        formatSize(doc.sizeBytes, this.locale),
        reviewedLabel(doc.reviewedStatus),
      ].join(' · ');
      return { ...doc, heading, meta };
    }),
  );

  protected toggle(doc: DossierDocument, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.review.emit({ id: doc.id, status: checked ? 'conform' : 'pending' });
  }
}
