import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Une case de la pagination : un numéro de page, ou une ellipse entre deux plages. */
export type PageSlot = number | 'gap';

/**
 * Pages à montrer : la première, la dernière, la courante et ses voisines, des ellipses entre les
 * trous (« 1 … 4 5 6 … 12 »).
 */
export function pageSlots(page: number, totalPages: number): PageSlot[] {
  const shown = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...shown].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const slots: PageSlot[] = [];
  pages.forEach((n, index) => {
    if (index > 0 && n - pages[index - 1] > 1) slots.push('gap');
    slots.push(n);
  });
  return slots;
}

/**
 * Pagination par page de l'annuaire (fiche 08) : « ‹ Précédent · 1 2 … N · Suivant › » calculée
 * depuis `page` / `totalPages` de la réponse. Des liens (le paramètre `page` de l'URL change, les
 * autres restent) : la page voisine se partage et s'ouvre dans un onglet. Rien sous deux pages.
 */
@Component({
  selector: 'pm-pagination',
  imports: [RouterLink],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  protected readonly slots = computed(() => pageSlots(this.page(), this.totalPages()));

  /** Page 1 : le paramètre disparaît de l'URL. */
  protected params(page: number): Record<string, string | null> {
    return { page: page > 1 ? String(page) : null };
  }
}
