import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** Modules sombres d'un QR code, en un seul chemin SVG, et la taille de la grille (marge comprise). */
export interface QrMatrix {
  size: number;
  path: string;
}

/** Zone de silence autour du code (modules), recommandée par la norme : 4, 2 suffit aux lecteurs. */
const QUIET_ZONE = 2;

/**
 * Encode `value` en QR code (niveau de correction M, taille automatique). Chaque module sombre est
 * un carré de 1 × 1 du chemin ; le dessin se met à l'échelle avec le viewBox. Valeur vide ou trop
 * longue : grille vide (rien n'est dessiné).
 */
export function qrMatrix(value: string): QrMatrix {
  if (!value) return { size: 0, path: '' };
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: count + 2 * QUIET_ZONE, path };
  } catch {
    return { size: 0, path: '' };
  }
}

/**
 * QR code dessiné côté web depuis l'URI otpauth:// (fiche 18 B) : `role="img"` avec son étiquette,
 * le secret en texte à côté en est l'alternative. Fond et modules en tokens du thème.
 */
@Component({
  selector: 'pm-qr-code',
  template: `
    @if (matrix().size > 0) {
      <svg
        class="qr"
        role="img"
        [attr.aria-label]="label()"
        [attr.viewBox]="'0 0 ' + matrix().size + ' ' + matrix().size"
        focusable="false"
      >
        <rect
          class="quiet"
          x="0"
          y="0"
          [attr.width]="matrix().size"
          [attr.height]="matrix().size"
        />
        <path class="modules" [attr.d]="matrix().path" shape-rendering="crispEdges" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    .qr {
      width: 200px;
      height: 200px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
    }
    .quiet {
      fill: var(--surface-raised);
    }
    .modules {
      fill: var(--text-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCodeComponent {
  /** Contenu encodé (URI otpauth://). */
  readonly value = input.required<string>();
  /** Étiquette lue par le lecteur d'écran. */
  readonly label = input.required<string>();

  protected readonly matrix = computed(() => qrMatrix(this.value()));
}
