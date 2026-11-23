import { TestBed } from '@angular/core/testing';

import { documentOf } from '../data/admin.fixtures';
import { DocumentViewerComponent } from './document-viewer.component';

async function render(title: string | null) {
  TestBed.configureTestingModule({ imports: [DocumentViewerComponent] });
  const fixture = TestBed.createComponent(DocumentViewerComponent);
  fixture.componentRef.setInput(
    'document',
    title === null ? null : documentOf({ title, mime: 'image/png' }),
  );
  fixture.componentRef.setInput('file', {
    objectUrl: 'blob:local',
    signedUrl: '/signed',
    expiresAt: null,
  });
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

/**
 * M16-13, visionneuse (fiche 20) : intitulé saisi en dir="auto", texte inchangé ; tiret de repli
 * sans sens imposé ; pourcentage du zoom en dir="ltr".
 */
describe('DocumentViewerComponent, de droite à gauche (M16-13)', () => {
  it('intitulé du justificatif en dir="auto", texte inchangé ; zoom en dir="ltr"', async () => {
    const el = await render('شهادة الماجستير');
    const file = el.querySelector('.file')!;
    expect(file.getAttribute('dir')).toBe('auto');
    expect(file.textContent).toBe('شهادة الماجستير');
    expect(el.querySelector('.tools .mono')?.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.tools .mono')?.textContent).toBe('100 %');
  });

  it('sans justificatif : tiret de repli, sans dir', async () => {
    const el = await render(null);
    const file = el.querySelector('.file')!;
    expect(file.getAttribute('dir')).toBeNull();
    expect(file.textContent).toBe('—');
  });
});
