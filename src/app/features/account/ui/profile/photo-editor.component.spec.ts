import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../../core/http';
import { PhotoEditorComponent } from './photo-editor.component';

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(PhotoEditorComponent);
  fixture.componentRef.setInput('initials', 'CM');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function buttons(el: HTMLElement): HTMLButtonElement[] {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
}

async function choose(
  fixture: { whenStable(): Promise<unknown> },
  el: HTMLElement,
  file: File,
): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

describe('PhotoEditorComponent', () => {
  it('sans photo : initiales et « Changer la photo » seulement', async () => {
    const { el } = await render();
    expect(el.querySelector('.avatar')?.textContent?.trim()).toBe('CM');
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Changer la photo']);
  });

  it('photo enregistrée sans URL locale : mention, et « Retirer la photo »', async () => {
    const { fixture, el } = await render({ hasPhoto: true });
    expect(el.textContent).toContain('Photo enregistrée');
    const remove = vi.fn();
    fixture.componentInstance.photoRemove.subscribe(remove);
    buttons(el)
      .find((b) => b.textContent?.includes('Retirer la photo'))!
      .click();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('URL locale : la photo remplace les initiales', async () => {
    const { el } = await render({ photoUrl: 'blob:photo', hasPhoto: true });
    expect(el.querySelector('.avatar img')?.getAttribute('src')).toBe('blob:photo');
    expect(el.textContent).not.toContain('Photo enregistrée');
  });

  it('occupé : boutons inactifs', async () => {
    const { el } = await render({ hasPhoto: true, busy: true });
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
  });

  it('format refusé côté client : message, rien n’est envoyé', async () => {
    const { fixture, el } = await render();
    const save = vi.fn();
    fixture.componentInstance.photoSave.subscribe(save);
    await choose(fixture, el, new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('JPEG ou PNG');
    expect(el.querySelector('.cropper')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('image illisible : message, pas de recadrage', async () => {
    const { fixture, el } = await render();
    await choose(fixture, el, new File(['pas une image'], 'a.jpg', { type: 'image/jpeg' }));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("n'a pas pu être lue");
    expect(el.querySelector('.cropper')).toBeNull();
  });

  it.each<[string, number, string]>([
    ['PHOTO_TOO_LARGE', 413, 'dépasse 5 Mo'],
    ['PHOTO_UNSUPPORTED', 415, 'JPEG ou PNG'],
    ['PHOTO_TOO_LARGE_DIMENSIONS', 422, '25 millions de pixels'],
    ['PHOTO_INVALID', 422, "n'a pas pu lire"],
    ['RATE_LIMITED', 429, "n'a pas pu être enregistrée"],
  ])('refus du serveur %s : message dédié', async (code, status, text) => {
    const problem: ApiProblem = { status, code };
    const { el } = await render({ problem });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(text);
  });
});
