import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  LOCALE_ID,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { AUTH_PATHS, Profession, SessionStore, VerificationStatus } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { formatDate } from '../../../core/i18n';
import {
  AccountNavComponent,
  ConfirmDialogService,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { DocumentType, isDocumentType, ProfessionalInfoPatch } from '../data/verification.api';
import { VerificationStore } from '../data/verification.store';
import { documentTypeShort, professionLabel } from '../ui/document-labels';
import { DocumentListComponent } from '../ui/document-list.component';
import { DocumentUploadComponent, DocumentUploadRequest } from '../ui/document-upload.component';
import { ProfessionalInfoFormComponent } from '../ui/professional-info-form.component';
import { VerificationProgressComponent } from '../ui/verification-progress.component';

/** Une ligne du tableau des états et verrous (fiche 13, règles de verrouillage). */
interface LockRow {
  status: string;
  tool: string;
  directory: string;
}

/**
 * /mon-compte/dossier-professionnel (fiche 13) : progression en quatre jalons, informations
 * professionnelles, justificatifs typés avec statut, dépôt par glisser-déposer, règle de
 * complétude du serveur reflétée (« Il manque : … », encart conseillé), Soumettre et Plus tard,
 * états et verrous. Le bandeau d'état global (coquille) change dès la soumission : la session est
 * relue par le store.
 */
@Component({
  selector: 'pm-verification-page',
  imports: [
    RouterLink,
    MatButtonModule,
    AccountNavComponent,
    StateComponent,
    VerificationProgressComponent,
    ProfessionalInfoFormComponent,
    DocumentListComponent,
    DocumentUploadComponent,
  ],
  providers: [VerificationStore],
  templateUrl: './verification.page.html',
  styleUrl: './verification.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationPage {
  protected readonly store = inject(VerificationStore);
  protected readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);

  private readonly uploadForm = viewChild(DocumentUploadComponent);

  protected readonly homePath = AUTH_PATHS.home;
  protected readonly stateKind = stateKind;
  protected readonly retryLabel = $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`;
  protected readonly emptyTitle = $localize`:État vide de la liste des justificatifs@@account.verification.docs.empty.title:Aucun justificatif déposé`;
  protected readonly emptyMessage = $localize`:Texte de l'état vide@@account.verification.docs.empty.message:Ajoutez votre diplôme et votre pièce d'identité avec le formulaire ci-dessous.`;
  protected readonly retry = (): void => {
    void this.store.load();
  };

  protected readonly name = computed(() => this.session.me()?.displayName ?? '');
  protected readonly profession = computed<Profession | null>(
    () => this.store.verification()?.profession ?? this.session.me()?.profession ?? null,
  );
  protected readonly subtitle = computed(() => {
    const city = this.store.verification()?.professionalInfo.address.city;
    const label = professionLabel(this.profession());
    return city ? `${label} · ${city}` : label;
  });

  protected readonly missingText = computed(() => {
    const missing = this.store.missing();
    if (missing.length === 0) return null;
    return $localize`:Pièces obligatoires manquantes@@account.verification.missing:Il manque : ${missing.map(documentTypeShort).join(', ')}:list:.`;
  });

  protected readonly recommendedText = computed(() => {
    const recommended = this.store.recommended();
    if (recommended.length === 0) return null;
    return $localize`:Pièces conseillées absentes (G Q14)@@account.verification.recommended:Conseillé pour votre profession, sans bloquer la soumission : ${recommended.map(documentTypeShort).join(', ')}:list:.`;
  });

  protected readonly submittedAtText = computed(() => {
    const at = this.store.verification()?.submittedAt;
    return at ? formatDate(at, this.locale, 'long') : '';
  });

  protected readonly submitMessage = computed(() => submitError(this.store.submission().problem));

  protected readonly lockRows: LockRow[] = [
    {
      status: $localize`:État du dossier@@account.verification.lock.docsPending:Justificatifs attendus`,
      tool: $localize`:Outil clinique accessible@@account.verification.lock.yes:oui`,
      directory: $localize`:Annuaire inaccessible@@account.verification.lock.no:non`,
    },
    {
      status: $localize`:État du dossier@@account.verification.lock.underReview:En cours de vérification`,
      tool: $localize`:Outil clinique accessible@@account.verification.lock.yes:oui`,
      directory: $localize`:Annuaire inaccessible@@account.verification.lock.no:non`,
    },
    {
      status: $localize`:État du dossier@@account.verification.lock.needsMore:Complément demandé`,
      tool: $localize`:Outil clinique accessible@@account.verification.lock.yes:oui`,
      directory: $localize`:Annuaire inaccessible@@account.verification.lock.no:non`,
    },
    {
      status: $localize`:État du dossier@@account.verification.lock.approved:Approuvé`,
      tool: $localize`:Outil clinique accessible@@account.verification.lock.yes:oui`,
      directory: $localize`:Annuaire accessible et badge vérifié@@account.verification.lock.yesBadge:oui, badge « Profil vérifié »`,
    },
    {
      status: $localize`:État du dossier@@account.verification.lock.rejected:Refusé`,
      tool: $localize`:Outil clinique fermé@@account.verification.lock.suspended:non (compte suspendu, recours possible)`,
      directory: $localize`:Annuaire inaccessible@@account.verification.lock.no:non`,
    },
  ];

  constructor() {
    void this.store.load();
  }

  protected statusLabel(status: VerificationStatus): string {
    switch (status) {
      case 'docs_pending':
        return this.lockRows[0].status;
      case 'under_review':
        return this.lockRows[1].status;
      case 'needs_more':
        return this.lockRows[2].status;
      case 'approved':
        return this.lockRows[3].status;
      default:
        return this.lockRows[4].status;
    }
  }

  protected async upload(request: DocumentUploadRequest): Promise<void> {
    const ok = await this.store.uploadDocument(request.input, request.file);
    if (ok) {
      this.uploadForm()?.reset();
      this.toast.success(
        $localize`:Toast après dépôt@@account.verification.toast.uploaded:Justificatif ajouté au dossier.`,
      );
    }
  }

  protected async remove(id: string): Promise<void> {
    const doc = this.store.documents().find((d) => d.id === id);
    if (!doc) return;
    const confirmed = await this.confirm.confirm({
      title: $localize`:Titre de la confirmation de retrait@@account.verification.remove.title:Retirer « ${doc.title}:title: » ?`,
      description: $localize`:Texte de la confirmation de retrait@@account.verification.remove.description:Le fichier est effacé du stockage. Vous pourrez en déposer un autre.`,
      confirmLabel: $localize`:Bouton de la confirmation de retrait@@account.verification.remove.confirm:Retirer`,
      destructive: true,
    });
    if (!confirmed) return;
    if (await this.store.remove(id)) {
      this.toast.info(
        $localize`:Toast après retrait@@account.verification.toast.removed:Justificatif retiré.`,
      );
    }
  }

  protected async open(id: string): Promise<void> {
    const url = await this.store.documentUrl(id);
    if (url) this.document.defaultView?.open(url, '_blank', 'noopener');
  }

  protected async submit(): Promise<void> {
    if (await this.store.submit()) {
      this.toast.success(
        $localize`:Toast après soumission@@account.verification.toast.submitted:Dossier soumis. Un administrateur le vérifie sous 2 jours ouvrés.`,
      );
    } else if (this.store.submission().problem?.status === 409) {
      // La règle de complétude a changé côté serveur : on relit le dossier plutôt que de deviner.
      await this.store.load();
    }
  }

  protected saveInfo(patch: ProfessionalInfoPatch): void {
    void this.store.saveInfo(patch);
  }
}

/** Message sous le bouton Soumettre après un refus. */
function submitError(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  if (problem.status === 409 && problem.code === 'VERIFICATION_INCOMPLETE') {
    const missing = (
      Array.isArray(problem.extra?.['missing']) ? (problem.extra['missing'] as unknown[]) : []
    ).filter(isDocumentType) as DocumentType[];
    const list = missing.map(documentTypeShort).join(', ');
    return missing.length > 0
      ? $localize`:409 VERIFICATION_INCOMPLETE avec la liste@@account.verification.submit.incomplete:Le serveur refuse la soumission, il manque : ${list}:list:.`
      : $localize`:409 VERIFICATION_INCOMPLETE sans liste@@account.verification.submit.incompleteNoList:Le serveur refuse la soumission : des justificatifs obligatoires manquent.`;
  }
  if (problem.status === 409) {
    return $localize`:409 VERIFICATION_LOCKED à la soumission@@account.verification.submit.locked:Le dossier ne peut pas être soumis dans son état actuel.`;
  }
  return $localize`:Soumission impossible@@account.verification.submit.failed:La soumission a échoué. Rien n'a été modifié ; réessayez dans un instant.`;
}
