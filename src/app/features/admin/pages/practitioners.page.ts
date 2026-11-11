import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { initials, isRefreshing, stateKind } from '../../../shared/util';
import {
  AccountItem,
  AccountRole,
  Appeal,
  AppealOutcome,
  COUNTED_STATUSES,
  CountedStatus,
  Profession,
} from '../data/admin.model';
import { AppealsStore } from '../data/appeals.store';
import { PractitionerFilters, PractitionersStore } from '../data/practitioners.store';
import { formatAge, formatDay, professionLabel, statusLabel, statusTone } from '../ui/admin-labels';
import { AppealListComponent } from '../ui/appeal-list.component';
import { ReasonDialogComponent, ReasonDialogData } from '../ui/reason-dialog.component';

/** Attente avant d'envoyer la recherche. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Longueur minimale d'un motif de suspension ou de réactivation (contrat : 20 à 4000). */
export const REASON_MIN_LENGTH = 20;

/** Recours visibles avant « Afficher les n autres recours ». */
export const APPEALS_SHOWN = 3;

const PROFESSIONS: readonly Profession[] = ['psychologist', 'psychiatrist', 'coach'];

/**
 * /admin/praticiens (fiche 21) : comptes avec recherche, statut (segments), profession, rôle,
 * compteurs par statut, « Afficher plus » ; Suspendre… / Réactiver… avec motif obligatoire ;
 * recours ouverts avec décision (G Q28). Filtres dans l'URL. Aucune donnée patient.
 */
@Component({
  selector: 'pm-practitioners-page',
  imports: [MatButtonModule, RouterLink, StateComponent, AppealListComponent],
  providers: [PractitionersStore, AppealsStore],
  templateUrl: './practitioners.page.html',
  styleUrl: './practitioners.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PractitionersPage {
  readonly q = input<string>();
  readonly status = input<string>();
  readonly role = input<string>();
  readonly profession = input<string>();

  protected readonly store = inject(PractitionersStore);
  protected readonly appeals = inject(AppealsStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);
  private readonly session = inject(SessionStore);

  protected readonly professions = PROFESSIONS;
  protected readonly statuses = COUNTED_STATUSES;

  private readonly filters = computed<PractitionerFilters>(() => ({
    q: (this.q() ?? '').trim(),
    status: COUNTED_STATUSES.includes(this.status() as CountedStatus)
      ? (this.status() as CountedStatus)
      : null,
    role:
      this.role() === 'all' ? null : this.role() === 'admin' ? 'admin' : ('practitioner' as const),
    profession: PROFESSIONS.includes(this.profession() as Profession)
      ? (this.profession() as Profession)
      : null,
  }));

  /** Texte de recherche affiché tout de suite ; envoyé dans l'URL après la pause de frappe. */
  protected readonly query = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly kind = computed(() =>
    stateKind(this.store.page(), (page) => page.items.length === 0),
  );
  protected readonly refreshing = computed(() => isRefreshing(this.store.page()));
  protected readonly staleError = computed(
    () => this.store.page().status === 'error' && this.kind() === null,
  );
  protected readonly appealsKind = computed(() => stateKind(this.appeals.page()));
  /** Recours affichés d'emblée (UX-E2) : la liste des comptes reste en tête de page. */
  protected readonly showAllAppeals = signal(false);
  protected readonly visibleAppeals = computed(() =>
    this.showAllAppeals() ? this.appeals.items() : this.appeals.items().slice(0, APPEALS_SHOWN),
  );
  protected readonly hiddenAppeals = computed(
    () => this.appeals.items().length - this.visibleAppeals().length,
  );

  protected readonly rows = computed(() =>
    this.store.items().map((account) => ({
      ...account,
      initials: initials(account.displayName),
      where: [professionLabel(account.profession), account.city].filter(Boolean).join(' · '),
      statusText: statusLabel(account.status),
      tone: statusTone(account.status),
      since: formatAge(account.statusSince, this.locale),
      created: formatDay(account.createdAt, this.locale),
      lastLogin: account.lastLoginAt ? formatDay(account.lastLoginAt, this.locale) : null,
      purge: account.purgeAt ? formatDay(account.purgeAt, this.locale) : null,
      // Le serveur refuse aussi (409 ADMIN_SELF_SUSPEND) : on n'offre pas l'action sur soi-même.
      canSuspend:
        !['suspended', 'rejected', 'closed'].includes(account.status) &&
        account.id !== this.session.me()?.id,
      canReactivate: account.status === 'suspended' || account.status === 'rejected',
    })),
  );

  protected readonly breakdown = computed(() => {
    const counts = this.store.counts();
    if (!counts) return [];
    return COUNTED_STATUSES.map((status) => ({
      status,
      label: statusLabel(status),
      count: counts[status],
      tone: statusTone(status),
    }));
  });

  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };
  protected readonly retryAppeals: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.appeals.load(),
  };

  constructor() {
    effect(() => {
      const filters = this.filters();
      untracked(() => {
        if (filters.q !== this.query().trim()) this.query.set(filters.q);
        void this.store.setFilters(filters);
      });
    });
    // Au premier rendu, comme les autres lectures (voir VocabularyPage : une instance créée puis
    // aussitôt remplacée par l'habillage admin ne doit rien lire).
    effect(() => untracked(() => void this.appeals.load()));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected segmentLabel(status: CountedStatus | null): string {
    if (status === null) return $localize`:Segment de statut@@admin.practitioners.all:Tous`;
    const count = this.store.counts()?.[status];
    const label = statusLabel(status);
    return count === undefined ? label : `${label} (${count})`;
  }

  protected professionText(profession: Profession): string {
    return professionLabel(profession);
  }

  protected onQuery(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.navigate({ q: text.trim() || null }), SEARCH_DEBOUNCE_MS);
  }

  protected setStatus(status: CountedStatus | null): void {
    this.navigate({ status });
  }

  protected onProfession(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ profession: value || null });
  }

  protected onRole(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AccountRole | 'all';
    this.navigate({ role: value === 'practitioner' ? null : value });
  }

  protected roleValue(): string {
    const role = this.filters().role;
    return role ?? 'all';
  }

  protected async suspend(account: AccountItem): Promise<void> {
    const done = await this.openReason({
      title: $localize`:Titre de la suspension@@admin.suspend.title:Suspendre ${account.displayName}:name: ?`,
      description: $localize`:Effets de la suspension@@admin.suspend.description:Toutes ses sessions sont révoquées, la connexion est bloquée et sa fiche publique est retirée de l'annuaire. Le praticien reçoit le motif par e-mail et peut déposer un recours.`,
      label: $localize`:Champ motif de suspension@@admin.suspend.label:Motif de la suspension`,
      minLength: REASON_MIN_LENGTH,
      confirmLabel: $localize`:Bouton de suspension@@admin.suspend.confirm:Suspendre le compte`,
      destructive: true,
      lockedNotice: $localize`:Case non décochable@@admin.suspend.notice:Envoyer le motif au praticien (obligatoire)`,
      submit: (reason) => this.store.suspend(account.id, reason),
    });
    if (done) {
      this.toast.success(
        $localize`:Toast après suspension@@admin.suspend.toast:${account.displayName}:name: suspendu · sessions révoquées, e-mail envoyé`,
      );
    }
  }

  protected async reactivate(account: AccountItem): Promise<void> {
    const description =
      account.status === 'rejected'
        ? $localize`:Effets d'une réactivation après refus@@admin.reactivate.rejected:Le dossier avait été refusé : le compte revient à « justificatifs à déposer », le praticien doit redéposer ses pièces.`
        : $localize`:Effets d'une réactivation@@admin.reactivate.description:Le compte retrouve le statut qu'il avait avant la suspension. Le praticien est prévenu par e-mail.`;
    const done = await this.openReason({
      title: $localize`:Titre de la réactivation@@admin.reactivate.title:Réactiver ${account.displayName}:name: ?`,
      description,
      label: $localize`:Champ motif de réactivation@@admin.reactivate.label:Motif de la réactivation`,
      minLength: REASON_MIN_LENGTH,
      confirmLabel: $localize`:Bouton de réactivation@@admin.reactivate.confirm:Réactiver le compte`,
      submit: (reason) => this.store.reactivate(account.id, reason),
    });
    if (done) {
      this.toast.success(
        $localize`:Toast après réactivation@@admin.reactivate.toast:${account.displayName}:name: réactivé · e-mail envoyé`,
      );
    }
  }

  protected async decideAppeal(appeal: Appeal, outcome: AppealOutcome): Promise<void> {
    const accepted = outcome === 'accepted';
    const done = await this.openReason({
      title: accepted
        ? $localize`:Titre de l'acceptation d'un recours@@admin.appeals.acceptTitle:Accepter le recours de ${appeal.practitionerDisplayName}:name: ?`
        : $localize`:Titre du rejet d'un recours@@admin.appeals.dismissTitle:Écarter le recours de ${appeal.practitionerDisplayName}:name: ?`,
      description: accepted
        ? $localize`:Effets de l'acceptation d'un recours@@admin.appeals.acceptDescription:Le compte est réactivé (statut d'avant la suspension, ou justificatifs à déposer après un refus). Votre réponse est envoyée par e-mail.`
        : $localize`:Effets du rejet d'un recours@@admin.appeals.dismissDescription:Le compte reste en l'état. Votre réponse est envoyée par e-mail ; le recours est clos.`,
      label: $localize`:Champ réponse à un recours@@admin.appeals.label:Réponse au praticien`,
      minLength: 1,
      confirmLabel: accepted
        ? $localize`:Bouton d'acceptation d'un recours@@admin.appeals.acceptConfirm:Accepter et réactiver`
        : $localize`:Bouton de rejet d'un recours@@admin.appeals.dismissConfirm:Écarter le recours`,
      destructive: !accepted,
      submit: async (message): Promise<ApiProblem | null> => {
        const problem = await this.appeals.decide(appeal.id, outcome, message);
        if (!problem && accepted) await this.store.reload();
        return problem;
      },
    });
    if (done) {
      this.toast.success(
        accepted
          ? $localize`:Toast après acceptation d'un recours@@admin.appeals.acceptToast:Recours accepté · compte réactivé, e-mail envoyé`
          : $localize`:Toast après rejet d'un recours@@admin.appeals.dismissToast:Recours écarté · e-mail envoyé`,
      );
    }
  }

  private async openReason(data: ReasonDialogData): Promise<boolean> {
    const ref = this.dialog.open<ReasonDialogComponent, ReasonDialogData, boolean>(
      ReasonDialogComponent,
      {
        data,
        role: 'dialog',
        ariaModal: true,
        ariaLabelledBy: 'reason-dialog-title',
        ariaDescribedBy: 'reason-dialog-description',
        autoFocus: 'textarea',
        restoreFocus: true,
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
      },
    );
    return new Promise((resolve) =>
      ref.afterClosed().subscribe((value) => resolve(value === true)),
    );
  }

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
