import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { initials } from '../../../shared/util';
import { QueueItem, QueueStatus } from '../data/admin.model';
import { documentTypeLabel, formatAge, professionLabel } from './admin-labels';

/**
 * File de vérification (fiche 20) : `<ol>` étiquetée, du plus ancien au plus récent, un lien par
 * dossier (`aria-current` sur le dossier ouvert), ancienneté en mono, rouge et écrite « hors délai »
 * au-delà de 2 jours ouvrés (jamais la couleur seule). ↑ ↓ déplacent le focus, Entrée ouvre.
 */
@Component({
  selector: 'pm-queue-list',
  imports: [RouterLink],
  template: `
    <ol [attr.aria-label]="label()">
      @for (item of rows(); track item.practitionerId) {
        <li>
          <a
            [routerLink]="['/admin/validation', item.practitionerId]"
            [queryParams]="status() === 'needs_more' ? { status: 'needs_more' } : {}"
            [attr.aria-current]="item.practitionerId === selectedId() ? 'true' : null"
            [class.selected]="item.practitionerId === selectedId()"
            (keydown)="onKey($event)"
          >
            <span class="initials" [class]="item.profession" aria-hidden="true">{{
              item.initials
            }}</span>
            <span class="who">
              <span class="name">{{ item.displayName }}</span>
              <span class="meta">{{ item.meta }}</span>
              @if (item.missing) {
                <span class="missing">{{ item.missing }}</span>
              }
            </span>
            <span class="age" [class.overdue]="item.overdue">
              {{ item.age }}
              @if (item.overdue) {
                <span class="late" i18n="Mention d'un dossier hors délai@@admin.queue.overdue"
                  >hors délai</span
                >
              }
            </span>
          </a>
        </li>
      }
    </ol>
  `,
  styleUrl: './queue-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueListComponent {
  readonly items = input.required<QueueItem[]>();
  readonly selectedId = input<string | null>(null);
  readonly status = input<QueueStatus>('under_review');

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly label = computed(() =>
    this.status() === 'needs_more'
      ? $localize`:Étiquette de la file@@admin.queue.label.needsMore:Dossiers en attente d'un complément`
      : $localize`:Étiquette de la file@@admin.queue.label.pending:Dossiers en attente de vérification`,
  );

  protected readonly rows = computed(() =>
    this.items().map((item) => {
      const documents = $localize`:Nombre de justificatifs d'un dossier@@admin.queue.documents:${item.documentsCount}:count: documents`;
      const parts = [professionLabel(item.profession), item.city, documents].filter(Boolean);
      const missing = item.missingHints.map(documentTypeLabel).join(', ');
      return {
        ...item,
        initials: initials(item.displayName),
        meta: parts.join(' · '),
        missing: missing
          ? $localize`:Pièces obligatoires absentes@@admin.queue.missing:Manque : ${missing}:missing:`
          : '',
        age: formatAge(item.submittedAt, this.locale),
      };
    }),
  );

  /** ↑ ↓ entre les dossiers ; Début et Fin vont au premier et au dernier. */
  protected onKey(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const links = [...this.host.nativeElement.querySelectorAll<HTMLAnchorElement>('ol a')];
    if (links.length === 0) return;
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    let next = current;
    if (event.key === 'ArrowDown') next = Math.min(links.length - 1, current + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = links.length - 1;
    event.preventDefault();
    links[next].focus();
  }
}
