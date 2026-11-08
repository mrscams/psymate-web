import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

import { StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import { DecisionInput, QUEUE_STATUSES, QueueStatus } from '../data/admin.model';
import { DossierStore } from '../data/dossier.store';
import { VerificationQueueStore } from '../data/verification-queue.store';
import { DecisionFormComponent } from '../ui/decision-form.component';
import { DocumentListComponent } from '../ui/document-list.component';
import { DocumentViewerComponent } from '../ui/document-viewer.component';
import { DossierHeaderComponent } from '../ui/dossier-header.component';
import { QueueListComponent } from '../ui/queue-list.component';

/**
 * /admin/validation[/:practitionerId] (fiche 20, B3 flux 10) : file à gauche (du plus ancien au plus
 * récent, filtre dans l'URL), dossier ouvert à droite : en-tête, justificatifs avec « Conforme »,
 * visionneuse, liste de contrôle, décision. Après une décision : toast, file relue, dossier suivant.
 */
@Component({
  selector: 'pm-validation-page',
  imports: [
    MatButtonModule,
    StateComponent,
    QueueListComponent,
    DossierHeaderComponent,
    DocumentListComponent,
    DocumentViewerComponent,
    DecisionFormComponent,
  ],
  providers: [VerificationQueueStore, DossierStore],
  templateUrl: './validation.page.html',
  styleUrl: './validation.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidationPage {
  /** Paramètre de route (withComponentInputBinding). */
  readonly practitionerId = input<string>();
  /** ?status=needs_more : file des compléments demandés. */
  readonly status = input<string>();

  protected readonly queue = inject(VerificationQueueStore);
  protected readonly dossier = inject(DossierStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly statuses = QUEUE_STATUSES;
  /** Nom de la région du dossier tant qu'aucun dossier n'est chargé (vide, chargement, erreur). */
  protected readonly dossierLabel = $localize`:Nom de la région du dossier@@admin.validation.dossierRegion:Dossier ouvert`;
  protected readonly queueStatus = computed<QueueStatus>(() =>
    this.status() === 'needs_more' ? 'needs_more' : 'under_review',
  );

  protected readonly title = computed(() => {
    const total = this.queue.total();
    return total === null
      ? $localize`:Titre de la file de vérification@@admin.validation.title:À vérifier`
      : $localize`:Titre de la file de vérification avec total@@admin.validation.titleCount:À vérifier · ${total}:count:`;
  });

  protected readonly queueKind = computed(() => stateKind(this.queue.page()));
  protected readonly queueRefreshing = computed(() => isRefreshing(this.queue.page()));
  protected readonly queueStale = computed(
    () => this.queue.page().status === 'error' && this.queueKind() === null,
  );
  protected readonly dossierKind = computed(() =>
    this.practitionerId() ? stateKind(this.dossier.dossier()) : null,
  );

  protected readonly retryQueue: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.queue.reload(),
  };
  protected readonly retryDossier: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => {
      const id = this.practitionerId();
      if (id) void this.dossier.load(id);
    },
  };
  protected readonly dossierErrorTitle = computed(() =>
    this.dossier.dossier().problem?.status === 404
      ? $localize`:Dossier introuvable@@admin.validation.notFound:Ce dossier n'existe pas`
      : $localize`:Erreur du dossier@@admin.validation.dossierError:Impossible de charger ce dossier`,
  );

  constructor() {
    effect(() => {
      const status = this.queueStatus();
      untracked(() => void this.queue.setStatus(status));
    });
    effect(() => {
      const id = this.practitionerId();
      untracked(() => {
        if (id) void this.dossier.load(id);
        else this.dossier.clear();
      });
    });
    // Sans dossier dans l'URL : le plus ancien de la file s'ouvre (fiche 20 : liste + dossier).
    effect(() => {
      const first = this.queue.items()[0];
      if (this.practitionerId() || !first || this.queue.page().status !== 'loaded') return;
      untracked(() => void this.open(first.practitionerId, true));
    });
  }

  protected labelOf(status: QueueStatus): string {
    return status === 'needs_more'
      ? $localize`:Filtre de la file@@admin.validation.filter.needsMore:Complément demandé`
      : $localize`:Filtre de la file@@admin.validation.filter.pending:En attente`;
  }

  protected countOf(status: QueueStatus): number | null {
    return this.queue.counts()?.[status] ?? null;
  }

  protected onStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QueueStatus;
    void this.router.navigate(['/admin/validation'], {
      queryParams: value === 'needs_more' ? { status: value } : {},
    });
  }

  protected onReview(change: { id: string; status: 'pending' | 'conform' | 'non_conform' }): void {
    void this.dossier.review(change.id, change.status);
  }

  protected refreshViewer(): void {
    void this.dossier.showDocument(this.dossier.selectedDocumentId());
  }

  protected async onDecide(input: DecisionInput): Promise<void> {
    const id = this.practitionerId();
    const name = this.dossier.dossier().data?.displayName ?? '';
    if (!id) return;
    const next = this.queue.neighbourOf(id);
    if (!(await this.dossier.decide(input))) return;
    this.toast.success(toastFor(input.kind, name));
    await this.queue.reload();
    const stillThere = this.queue.items().some((item) => item.practitionerId === next);
    await this.open(stillThere ? next : (this.queue.items()[0]?.practitionerId ?? null), false);
  }

  private async open(id: string | null, replaceUrl: boolean): Promise<void> {
    const queryParams = this.queueStatus() === 'needs_more' ? { status: 'needs_more' } : {};
    await this.router.navigate(id ? ['/admin/validation', id] : ['/admin/validation'], {
      queryParams,
      replaceUrl,
    });
  }
}

function toastFor(kind: DecisionInput['kind'], name: string): string {
  switch (kind) {
    case 'approved':
      return $localize`:Toast après approbation@@admin.validation.toast.approved:${name}:name: approuvé·e · e-mail envoyé`;
    case 'needs_more':
      return $localize`:Toast après demande de complément@@admin.validation.toast.needsMore:Complément demandé à ${name}:name: · e-mail envoyé`;
    default:
      return $localize`:Toast après refus@@admin.validation.toast.rejected:Dossier de ${name}:name: refusé · compte suspendu, e-mail envoyé`;
  }
}
