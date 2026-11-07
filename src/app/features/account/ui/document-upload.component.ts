import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
  inject,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { applyProblem, FieldErrorsComponent, fieldId, PmValidators } from '../../../shared/forms';
import {
  ACCEPTED_MIME,
  DOCUMENT_TYPES,
  DocumentType,
  DocumentUploadInput,
  MAX_DOCUMENT_BYTES,
} from '../data/verification.api';
import { UploadState } from '../data/verification.store';
import { documentTypeLabel } from './document-labels';

export interface DocumentUploadRequest {
  input: DocumentUploadInput;
  file: File;
}

/** Erreurs de forme du fichier, vérifiées avant tout appel (le serveur reste juge du contenu). */
type FileError = 'required' | 'tooLarge' | 'unsupported' | null;

const YEAR = /^\d{4}$/;
const ACCEPTED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

/**
 * Formulaire d'ajout d'un justificatif (fiche 13 §5) : type, intitulé, établissement · année,
 * fichier (`<input type="file">` réel avec label ; la zone de glisser-déposer est une amélioration
 * progressive), bouton Ajouter au dossier. Un fichier de plus de 10 Mo ou d'un autre format que
 * PDF / JPEG / PNG est refusé sous le champ sans appel ; 413, 415, 409 et 422 du serveur s'affichent
 * au même endroit ; la progression de l'envoi est visible.
 */
@Component({
  selector: 'pm-document-upload',
  imports: [ReactiveFormsModule, MatButtonModule, FieldErrorsComponent],
  templateUrl: './document-upload.component.html',
  styleUrl: './document-upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentUploadComponent {
  readonly state = input.required<UploadState>();
  /** Dossier non modifiable : le formulaire est désactivé (verrou). */
  readonly disabled = input(false);
  readonly upload = output<DocumentUploadRequest>();
  /** Un nouveau fichier est choisi : la page oublie l'erreur du dernier envoi. */
  readonly fileChanged = output<void>();

  protected readonly fieldId = (name: string) => fieldId(`document.${name}`);
  protected readonly types = DOCUMENT_TYPES;
  protected readonly typeLabel = documentTypeLabel;
  protected readonly accept = ACCEPTED_MIME.join(',');
  protected readonly progressLabel = $localize`:Étiquette de la barre de progression@@account.verification.upload.progress:Progression de l'envoi`;

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly form = inject(NonNullableFormBuilder).group({
    type: ['' as DocumentType | '', [Validators.required]],
    title: ['', [PmValidators.trimmedRequired, PmValidators.maxLengthTrimmed(200)]],
    issuer: ['', [PmValidators.maxLengthTrimmed(200)]],
    year: ['', [Validators.pattern(YEAR)]],
  });

  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<FileError>(null);
  protected readonly dragging = signal(false);

  protected readonly uploading = computed(() => this.state().status === 'uploading');

  /** Message sous le champ fichier : erreur de forme du client, sinon celle du serveur. */
  protected readonly fileMessage = computed(() => {
    const own = this.fileError();
    if (own) return clientFileMessage(own);
    const problem = this.state().problem;
    if (!problem) return null;
    return serverMessage(problem.status, problem.code, Boolean(problem.errors?.length));
  });

  constructor() {
    // 422 sur type / title / issuer / year : sous chaque champ (le fichier a son propre message).
    effect(() => {
      this.state().problem;
      untracked(() => this.applyServerErrors());
    });
    // Verrou : enable() recalcule les erreurs des contrôles, le 422 courant est reposé ensuite.
    effect(() => {
      const disabled = this.disabled();
      untracked(() => {
        if (disabled) this.form.disable();
        else this.form.enable();
        this.applyServerErrors();
      });
    });
  }

  private applyServerErrors(): void {
    const problem = this.state().problem;
    if (problem?.status === 422 && problem.errors?.length) applyProblem(this.form, problem);
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pick(input.files?.[0] ?? null);
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled()) return;
    this.pick(event.dataTransfer?.files?.[0] ?? null);
  }

  protected submit(): void {
    if (this.uploading() || this.disabled()) return;
    const file = this.file();
    if (!file) this.fileError.set('required');
    if (this.form.invalid || !file || this.fileError()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.upload.emit({
      input: {
        type: value.type as DocumentType,
        title: value.title.trim(),
        issuer: value.issuer.trim(),
        year: value.year.trim(),
      },
      file,
    });
  }

  /** Après un dépôt réussi : formulaire vide, prêt pour le document suivant. */
  reset(): void {
    this.form.reset({ type: '', title: '', issuer: '', year: '' });
    this.file.set(null);
    this.fileError.set(null);
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private pick(file: File | null): void {
    this.fileChanged.emit();
    this.file.set(file);
    this.fileError.set(checkFile(file));
  }
}

/** Forme du fichier : présent, 10 Mo au plus, PDF / JPEG / PNG d'après le type ou l'extension. */
export function checkFile(file: File | null): FileError {
  if (!file) return null;
  if (file.size > MAX_DOCUMENT_BYTES) return 'tooLarge';
  const mimeOk = (ACCEPTED_MIME as readonly string[]).includes(file.type);
  if (!mimeOk && !(file.type === '' && ACCEPTED_EXTENSIONS.test(file.name))) return 'unsupported';
  return null;
}

function clientFileMessage(error: Exclude<FileError, null>): string {
  switch (error) {
    case 'required':
      return $localize`:Fichier manquant@@account.verification.upload.error.required:Choisissez un fichier.`;
    case 'tooLarge':
      return $localize`:Fichier trop lourd (client et 413)@@account.verification.upload.error.tooLarge:Ce fichier dépasse 10 Mo. Réduisez-le ou choisissez un autre fichier ; le dossier n'a pas changé.`;
    case 'unsupported':
      return $localize`:Format refusé (client et 415)@@account.verification.upload.error.unsupported:Seuls les fichiers PDF, JPEG et PNG sont acceptés ; le dossier n'a pas changé.`;
  }
}

function serverMessage(status: number, code: string, fieldErrors: boolean): string | null {
  switch (status) {
    case 413:
      return clientFileMessage('tooLarge');
    case 415:
      return clientFileMessage('unsupported');
    case 409:
      return code === 'DOCUMENT_LIMIT'
        ? $localize`:409 DOCUMENT_LIMIT@@account.verification.upload.error.limit:Le dossier compte déjà 20 justificatifs : retirez-en un avant d'en ajouter.`
        : $localize`:409 VERIFICATION_LOCKED@@account.verification.upload.error.locked:Le dossier n'est plus modifiable dans son état actuel.`;
    case 422:
      return fieldErrors
        ? null
        : $localize`:422 DOCUMENT_INVALID@@account.verification.upload.error.invalid:Fichier vide, illisible ou image trop grande (25 millions de pixels au maximum).`;
    default:
      return $localize`:Envoi impossible@@account.verification.upload.error.failed:L'envoi a échoué. Rien n'a été modifié ; réessayez dans un instant.`;
  }
}
