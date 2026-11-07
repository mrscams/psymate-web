import { TestBed } from '@angular/core/testing';

import { QrCodeComponent, qrMatrix } from './qr-code.component';

const URI = 'otpauth://totp/PsyMate:claire@example.test?secret=JBSWY3DPEHPK3PXP&issuer=PsyMate';

describe('qrMatrix', () => {
  it('encode une URI otpauth en grille carrée avec zone de silence', () => {
    const matrix = qrMatrix(URI);
    expect(matrix.size).toBeGreaterThan(25);
    expect(matrix.path.startsWith('M')).toBe(true);
    // Le motif de repérage en haut à gauche commence après la marge de 2 modules.
    expect(matrix.path).toContain('M2 2h1v1h-1z');
  });

  it('valeur vide : rien à dessiner', () => {
    expect(qrMatrix('')).toEqual({ size: 0, path: '' });
  });
});

describe('QrCodeComponent', () => {
  it('rend un SVG role img étiqueté, viewBox à la taille de la grille', () => {
    const fixture = TestBed.createComponent(QrCodeComponent);
    fixture.componentRef.setInput('value', URI);
    fixture.componentRef.setInput('label', 'QR code à scanner');
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('QR code à scanner');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 (\d+) \1$/);
    expect(svg?.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(100);
  });
});
