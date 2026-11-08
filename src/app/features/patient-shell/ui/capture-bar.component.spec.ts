import { TestBed } from '@angular/core/testing';

import { CaptureBarComponent } from './capture-bar.component';

describe('CaptureBarComponent', () => {
  it('champ étiqueté « Noter quelque chose » ; Entrée émet le texte saisi', async () => {
    const fixture = TestBed.createComponent(CaptureBarComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBe(
      'Noter quelque chose',
    );
    expect(input.placeholder).toBe('Noter quelque chose…');

    const captured = vi.fn();
    fixture.componentInstance.capture.subscribe(captured);
    input.value = '  Angoisse avant l’examen  ';
    input.dispatchEvent(new Event('input'));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    expect(captured).toHaveBeenCalledWith('Angoisse avant l’examen');
    expect(enter.defaultPrevented).toBe(true);
  });
});
