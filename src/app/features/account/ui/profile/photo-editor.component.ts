import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ApiProblem } from '../../../../core/http';
import {
  CENTERED,
  cropToJpeg,
  CropView,
  decodeImage,
  DecodedImage,
  drawCrop,
  PHOTO_TYPES,
} from './crop';

/**
 * Photo du profil (fiche 10, Identité) : initiales par défaut, « Changer la photo », recadrage carré
 * côté web (zoom et position par curseurs natifs, utilisables au clavier), envoi d'un JPEG 512 px
 * produit par un canvas. Le parent envoie (`photoSave`) et fournit l'URL locale de l'aperçu.
 */
@Component({
  selector: 'pm-photo-editor',
  template: `
    <div class="photo">
      <div class="avatar" aria-hidden="true">
        @if (photoUrl(); as url) {
          <img [src]="url" alt="" />
        } @else {
          <span>{{ initials() }}</span>
        }
      </div>
      @if (hasPhoto() && !photoUrl()) {
        <p class="note" i18n="Photo enregistrée mais non affichable ici@@profile.photo.stored">
          Photo enregistrée
        </p>
      }
      <input
        #file
        hidden
        type="file"
        accept="image/jpeg,image/png"
        data-testid="photo-file"
        (change)="choose($event)"
      />
      @if (!editing()) {
        <button
          type="button"
          class="button"
          [disabled]="busy()"
          (click)="file.click()"
          i18n="Bouton pour choisir une photo@@profile.photo.change"
        >
          Changer la photo
        </button>
        @if (hasPhoto()) {
          <button
            type="button"
            class="button quiet"
            [disabled]="busy()"
            (click)="photoRemove.emit()"
            i18n="Bouton pour retirer la photo@@profile.photo.remove"
          >
            Retirer la photo
          </button>
        }
      }
    </div>

    @if (editing()) {
      <div class="cropper" role="group" aria-labelledby="crop-title" aria-describedby="crop-help">
        <p id="crop-title" class="title" i18n="Titre du recadrage@@profile.photo.cropTitle">
          Recadrer la photo
        </p>
        <p id="crop-help" class="help" i18n="Aide du recadrage@@profile.photo.cropHelp">
          La photo est recadrée en carré et réduite à 512 px. Ses métadonnées (lieu, appareil) ne
          sont pas envoyées.
        </p>
        <canvas #preview class="preview" width="160" height="160" aria-hidden="true"></canvas>
        <label class="range">
          <span i18n="Curseur de zoom@@profile.photo.zoom">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            [value]="view().zoom"
            (input)="setView('zoom', $event)"
          />
        </label>
        <label class="range">
          <span i18n="Curseur de position horizontale@@profile.photo.x">Position horizontale</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            [value]="view().x"
            (input)="setView('x', $event)"
          />
        </label>
        <label class="range">
          <span i18n="Curseur de position verticale@@profile.photo.y">Position verticale</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            [value]="view().y"
            (input)="setView('y', $event)"
          />
        </label>
        <div class="actions">
          <button
            type="button"
            class="button primary"
            [disabled]="busy()"
            (click)="confirm()"
            i18n="Bouton pour enregistrer la photo recadrée@@profile.photo.save"
          >
            Enregistrer la photo
          </button>
          <button
            type="button"
            class="button quiet"
            [disabled]="busy()"
            (click)="cancel()"
            i18n="Bouton pour annuler le recadrage@@profile.photo.cancel"
          >
            Annuler
          </button>
        </div>
      </div>
    }

    @if (message(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .photo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .avatar {
      width: 96px;
      height: 96px;
      border-radius: 14px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--primary-tint);
      color: var(--primary-hover);
      font: 600 32px/1 var(--font-ui);
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* Carte Identité étroite (conteneur pm-profile-card de la page) : photo et boutons en ligne,
       au-dessus de la grille des champs, pour que celle-ci garde ses deux colonnes. */
    @container pm-profile-card (max-width: 639px) {
      /* Avatar à gauche, boutons empilés à droite dans une colonne qui rétrécit (min 0) : la case
         garde la hauteur de l'avatar quelle que soit la police, rien ne passe à la ligne dessous. */
      .photo {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-auto-rows: min-content;
        align-items: center;
        justify-items: start;
        column-gap: 12px;
        row-gap: 4px;
      }
      .avatar {
        grid-row: 1 / span 3;
        width: 56px;
        height: 56px;
        font-size: 20px;
      }
      .photo > :not(.avatar) {
        grid-column: 2;
        max-width: 100%;
      }
      .button {
        min-height: 32px;
        white-space: normal;
        text-align: left;
      }
    }
    .note,
    .help {
      margin: 0;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
      text-align: center;
    }
    .help {
      text-align: left;
    }
    .cropper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--surface-sunken);
    }
    .title {
      margin: 0;
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
    }
    .preview {
      width: 160px;
      height: 160px;
      border-radius: 10px;
      background: var(--surface-raised);
    }
    .range {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .button {
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text-primary);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .button.primary {
      border-color: var(--primary);
      background: var(--primary);
      color: var(--primary-on);
    }
    .button.quiet {
      border-color: transparent;
      background: transparent;
      color: var(--text-secondary);
    }
    .button[disabled] {
      cursor: default;
      color: var(--text-disabled);
    }
    .button.primary[disabled] {
      background: var(--surface-sunken);
      border-color: var(--border-subtle);
    }
    .error {
      margin: 0;
      color: var(--danger);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoEditorComponent implements OnDestroy {
  readonly initials = input.required<string>();
  /** URL locale de la dernière photo envoyée (aucune route ne sert encore les photos). */
  readonly photoUrl = input<string | null>(null);
  readonly hasPhoto = input(false);
  readonly busy = input(false);
  /** Refus du serveur au dernier envoi (413, 415, 422). */
  readonly problem = input<ApiProblem | null>(null);

  readonly photoSave = output<Blob>();
  readonly photoRemove = output<void>();

  private readonly preview = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private readonly image = signal<DecodedImage | null>(null);
  protected readonly view = signal<CropView>(CENTERED);
  private readonly localError = signal<string | null>(null);

  protected readonly editing = computed(() => this.image() !== null);

  protected readonly message = computed(() => {
    const local = this.localError();
    if (local) return local;
    const problem = this.problem();
    return problem ? photoProblemMessage(problem) : null;
  });

  constructor() {
    // L'aperçu se redessine à chaque réglage (canvas natif, aucune bibliothèque).
    afterRenderEffect(() => {
      const canvas = this.preview()?.nativeElement;
      const image = this.image();
      const view = this.view();
      if (canvas && image) drawCrop(canvas, image, view, 160);
    });
  }

  ngOnDestroy(): void {
    this.image()?.close();
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.localError.set(null);
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      this.localError.set(
        $localize`:Photo d'un autre format@@profile.photo.badType:Choisissez une image JPEG ou PNG.`,
      );
      return;
    }
    try {
      const image = await decodeImage(file);
      this.image()?.close();
      this.view.set(CENTERED);
      this.image.set(image);
    } catch {
      this.localError.set(
        $localize`:Photo illisible@@profile.photo.unreadable:Cette image n'a pas pu être lue. Essayez une autre photo.`,
      );
    }
  }

  protected setView(key: keyof CropView, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.view.update((view) => ({ ...view, [key]: value }));
  }

  protected async confirm(): Promise<void> {
    const image = this.image();
    if (!image) return;
    try {
      const blob = await cropToJpeg(image, this.view());
      this.photoSave.emit(blob);
      this.cancel();
    } catch {
      this.localError.set(
        $localize`:Recadrage impossible@@profile.photo.cropFailed:Le recadrage a échoué. Essayez une autre photo.`,
      );
    }
  }

  protected cancel(): void {
    this.image()?.close();
    this.image.set(null);
  }
}

function photoProblemMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'PHOTO_TOO_LARGE':
      return $localize`:Photo refusée, plus de 5 Mo@@profile.photo.tooLarge:La photo dépasse 5 Mo.`;
    case 'PHOTO_UNSUPPORTED':
      return $localize`:Photo refusée, format@@profile.photo.unsupported:Le serveur n'accepte que les images JPEG ou PNG.`;
    case 'PHOTO_TOO_LARGE_DIMENSIONS':
      return $localize`:Photo refusée, trop de pixels@@profile.photo.tooManyPixels:Cette image est trop grande (plus de 25 millions de pixels).`;
    case 'PHOTO_INVALID':
      return $localize`:Photo refusée, illisible@@profile.photo.invalid:Le serveur n'a pas pu lire cette image.`;
    default:
      return $localize`:Photo non enregistrée@@profile.photo.failed:La photo n'a pas pu être enregistrée. Réessayez.`;
  }
}
