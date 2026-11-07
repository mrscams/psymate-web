import { TestBed } from '@angular/core/testing';

import { RECOVERY_CODES_FILENAME, RecoveryCodesComponent } from './recovery-codes.component';

const CODES = Array.from({ length: 10 }, (_, i) => `${String(i).repeat(5)}-ABCDE`);

function render() {
  const fixture = TestBed.createComponent(RecoveryCodesComponent);
  fixture.componentRef.setInput('codes', CODES);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RecoveryCodesComponent', () => {
  it('liste étiquetée de 10 codes, case décochée, saved émis quand elle est cochée', () => {
    const { fixture, el } = render();
    const list = el.querySelector('ul');
    expect(list?.getAttribute('aria-label')).toBe('Codes de secours');
    expect(list?.querySelectorAll('li')).toHaveLength(10);
    expect(el.textContent).toContain('00000-ABCDE');

    const emitted: boolean[] = [];
    fixture.componentInstance.saved.subscribe((value) => emitted.push(value));
    const checkbox = el.querySelector<HTMLInputElement>('input[type=checkbox]');
    expect(checkbox?.checked).toBe(false);
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));
    expect(emitted).toEqual([true]);
    expect(fixture.componentInstance.saved()).toBe(true);
  });

  it('Télécharger : fichier .txt avec les 10 codes, statut annoncé', () => {
    const { fixture, el } = render();
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:codes';
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    let download = '';
    const append = vi.spyOn(document.body, 'append').mockImplementation((node) => {
      download = (node as HTMLAnchorElement).download;
    });
    try {
      [...el.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Télécharger'))
        ?.click();
      fixture.detectChanges();
      expect(click).toHaveBeenCalled();
      expect(download).toBe(RECOVERY_CODES_FILENAME);
      expect(blobs[0].type).toContain('text/plain');
      expect(el.querySelector('[role=status]')?.textContent).toBe('Fichier téléchargé.');
    } finally {
      vi.unstubAllGlobals();
      click.mockRestore();
      append.mockRestore();
    }
  });

  it('Copier : les codes dans le presse-papiers, un par ligne', async () => {
    const { fixture, el } = render();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    try {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Copier'))?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
      expect(el.querySelector('[role=status]')?.textContent).toBe('Codes copiés.');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
