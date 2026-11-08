import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { ApiProblem } from '../../../core/http';
import { StateComponent } from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import { ViewerFile } from '../data/dossier.store';
import { DossierDocument } from '../data/admin.model';

/**
 * Visionneuse d'un justificatif (fiche 20) : nom du fichier en mono, « Ouvrir » (vrai document,
 * nouvel onglet, URL signée de 5 minutes), rendu natif dans une iframe pour un PDF (sa propre
 * pagination et son zoom) ou une image avec zoom ± et rotation. Le contenu est une URL blob locale :
 * le serveur interdit l'affichage du fichier signé dans un cadre (X-Frame-Options DENY).
 */
@Component({
  selector: 'pm-document-viewer',
  imports: [StateComponent],
  template: `
    <div class="toolbar">
      <span class="file">{{ document()?.title ?? '—' }}</span>
      @if (isImage()) {
        <span class="tools">
          <button
            type="button"
            (click)="zoomBy(-0.25)"
            [disabled]="zoom() <= 0.5"
            i18n="Bouton de la visionneuse@@admin.viewer.zoomOut"
          >
            Zoom −
          </button>
          <span class="mono" aria-live="polite">{{ zoomText() }}</span>
          <button
            type="button"
            (click)="zoomBy(0.25)"
            [disabled]="zoom() >= 3"
            i18n="Bouton de la visionneuse@@admin.viewer.zoomIn"
          >
            Zoom +
          </button>
          <button
            type="button"
            (click)="rotate()"
            i18n="Bouton de la visionneuse@@admin.viewer.rotate"
          >
            Pivoter
          </button>
        </span>
      }
      @if (file(); as f) {
        <a
          class="open"
          [href]="f.signedUrl"
          target="_blank"
          rel="noopener"
          (click)="onOpen($event)"
          i18n="Lien d'ouverture du justificatif dans un nouvel onglet@@admin.viewer.open"
          >Ouvrir dans un nouvel onglet</a
        >
      }
    </div>
    <div class="stage">
      @if (stateKind(); as kind) {
        <pm-state
          [kind]="kind"
          [title]="stateTitle()"
          [message]="stateMessage()"
          skeleton="profile"
          compact
        />
      } @else if (file(); as f) {
        @if (isImage()) {
          <div class="image-wrap">
            <img [src]="safeUrl()" [attr.alt]="altText()" [style.transform]="transform()" />
          </div>
        } @else {
          <iframe [src]="safeUrl()" [title]="altText()"></iframe>
        }
      }
    </div>
  `,
  styleUrl: './document-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentViewerComponent {
  readonly document = input<DossierDocument | null>(null);
  readonly file = input<ViewerFile | null>(null);
  readonly loading = input(false);
  readonly problem = input<ApiProblem | null>(null);
  /** L'URL signée a expiré : la page en demande une nouvelle. */
  readonly expired = output<void>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly zoom = signal(1);
  protected readonly rotation = signal(0);

  protected readonly isImage = computed(() => this.document()?.mime.startsWith('image/') ?? false);
  protected readonly zoomText = computed(() => `${Math.round(this.zoom() * 100)} %`);
  protected readonly transform = computed(
    () => `scale(${this.zoom()}) rotate(${this.rotation()}deg)`,
  );
  // URL blob créée par le store à partir du fichier reçu du serveur : jamais une donnée saisie.
  protected readonly safeUrl = computed(() => {
    const url = this.file()?.objectUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
  protected readonly altText = computed(() => {
    const title = this.document()?.title ?? '';
    return $localize`:Nom accessible de la visionneuse@@admin.viewer.alt:Justificatif : ${title}:title:`;
  });

  protected readonly stateKind = computed<StateKind | null>(() => {
    if (!this.document()) return 'empty';
    if (this.problem()) return 'error';
    if (this.loading() || !this.file()) return 'loading';
    return null;
  });
  protected readonly stateTitle = computed(() => {
    if (!this.document()) {
      return $localize`:Visionneuse vide@@admin.viewer.empty:Aucun justificatif affiché`;
    }
    if (this.problem()?.status === 410) {
      return $localize`:Justificatif purgé@@admin.viewer.purged:Ce fichier a été purgé`;
    }
    return $localize`:Erreur de la visionneuse@@admin.viewer.error:Impossible d'afficher ce justificatif`;
  });
  protected readonly stateMessage = computed(() =>
    this.document()
      ? undefined
      : $localize`:Visionneuse vide@@admin.viewer.emptyHint:Choisissez « Afficher » sur un justificatif.`,
  );

  protected zoomBy(step: number): void {
    this.zoom.update((zoom) => Math.min(3, Math.max(0.5, zoom + step)));
  }

  protected rotate(): void {
    this.rotation.update((angle) => (angle + 90) % 360);
  }

  /** URL signée périmée (5 minutes) : on en redemande une au lieu d'ouvrir un 403. */
  protected onOpen(event: MouseEvent): void {
    const expiresAt = this.file()?.expiresAt;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      event.preventDefault();
      this.expired.emit();
    }
  }
}
